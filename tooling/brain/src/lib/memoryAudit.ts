import path from "node:path";
import type { BrainClient } from "../client";
import { errorMessage, slugify, writeJsonFile, writeTextFile } from "./util";
import type { SnapshotError } from "./snapshot";

type MemoryStore = Awaited<ReturnType<BrainClient["beta"]["memoryStores"]["retrieve"]>>;

export interface MemoryEntry {
  id: string;
  path: string;
  content: string | null;
  contentSha256: string;
  bytes: number;
}

export interface MemoryStoreDump {
  store: MemoryStore;
  memories: MemoryEntry[];
}

export interface MemoryAudit {
  stores: MemoryStoreDump[];
  errors: SnapshotError[];
}

/**
 * Read-only: dump every memory store (or a single one) with the full content of
 * each memory, so the whole agent memory can be audited offline. Never mutates.
 */
export async function collectMemory(
  client: BrainClient,
  opts: { storeId?: string } = {}
): Promise<MemoryAudit> {
  const errors: SnapshotError[] = [];
  const stores: MemoryStoreDump[] = [];

  let storeList: MemoryStore[] = [];
  try {
    if (opts.storeId) {
      storeList = [await client.beta.memoryStores.retrieve(opts.storeId)];
    } else {
      for await (const store of client.beta.memoryStores.list()) {
        storeList.push(store);
      }
    }
  } catch (err) {
    errors.push({ resource: "memoryStores", message: errorMessage(err) });
    return { stores, errors };
  }

  for (const store of storeList) {
    const memories: MemoryEntry[] = [];
    try {
      // No `depth` → the list returns flat `memory` items (no prefix rollups).
      for await (const item of client.beta.memoryStores.memories.list(store.id, {
        path_prefix: "/"
      })) {
        if (item.type !== "memory") continue;
        let content = item.content ?? null;
        if (content === null) {
          // `list` may return the basic view; fetch full content by id.
          try {
            const full = await client.beta.memoryStores.memories.retrieve(item.id, {
              memory_store_id: store.id
            });
            content = full.content ?? null;
          } catch (err) {
            errors.push({
              resource: `memoryStores/${store.id}/memories/${item.id}`,
              message: errorMessage(err)
            });
          }
        }
        memories.push({
          id: item.id,
          path: item.path,
          content,
          contentSha256: item.content_sha256,
          bytes: item.content_size_bytes
        });
      }
    } catch (err) {
      errors.push({ resource: `memoryStores/${store.id}/memories`, message: errorMessage(err) });
    }
    memories.sort((a, b) => a.path.localeCompare(b.path));
    stores.push({ store, memories });
  }

  return { stores, errors };
}

interface StoreManifest {
  id: string;
  name: unknown;
  memoryCount: number;
  totalBytes: number;
  memories: { path: string; id: string; bytes: number; contentSha256: string }[];
}

/**
 * Write the memory dump under `dir`: one directory per store (named by slug),
 * each memory written at its own path, plus a per-store manifest and an overall
 * summary. `fetchedAt` is passed in to keep the writer deterministic.
 */
export async function writeMemoryAudit(
  audit: MemoryAudit,
  dir: string,
  fetchedAt: string
): Promise<void> {
  const summary: { fetchedAt: string; stores: StoreManifest[]; errors: SnapshotError[] } = {
    fetchedAt,
    stores: [],
    errors: audit.errors
  };

  for (const { store, memories } of audit.stores) {
    const storeName = (store as { name?: unknown }).name;
    const slug = slugify(typeof storeName === "string" ? storeName : store.id, store.id);
    const storeDir = path.join(dir, slug);

    for (const memory of memories) {
      // memory.path starts with "/"; join relative to the store dir.
      const filePath = path.join(storeDir, "memories", `.${memory.path}`);
      await writeTextFile(filePath, memory.content ?? "");
    }

    const manifest: StoreManifest = {
      id: store.id,
      name: storeName,
      memoryCount: memories.length,
      totalBytes: memories.reduce((sum, m) => sum + m.bytes, 0),
      memories: memories.map((m) => ({
        path: m.path,
        id: m.id,
        bytes: m.bytes,
        contentSha256: m.contentSha256
      }))
    };
    await writeJsonFile(path.join(storeDir, "manifest.json"), manifest);
    summary.stores.push(manifest);
  }

  await writeJsonFile(path.join(dir, "index.json"), summary);
}
