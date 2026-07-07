import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createBrainClient } from "../client";
import { collectMemory, writeMemoryAudit } from "./memoryAudit";

const API = "https://api.anthropic.com/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => createBrainClient("sk-ant-test", { maxRetries: 0 });

describe("collectMemory", () => {
  it("walks a store, ignores prefixes and fetches full content when basic", async () => {
    server.use(
      http.get(`${API}/memory_stores`, () =>
        HttpResponse.json({ data: [{ id: "memstore_1", name: "Coach Memory" }], next_page: null })
      ),
      http.get(`${API}/memory_stores/memstore_1/memories`, () =>
        HttpResponse.json({
          data: [
            {
              type: "memory",
              id: "mem_1",
              path: "/prefs.md",
              content: "inline",
              content_sha256: "abc",
              content_size_bytes: 6
            },
            {
              type: "memory",
              id: "mem_2",
              path: "/notes/a.md",
              content: null,
              content_sha256: "def",
              content_size_bytes: 4
            },
            { type: "memory_prefix", path: "/ignored/" }
          ],
          next_page: null
        })
      ),
      http.get(`${API}/memory_stores/memstore_1/memories/mem_2`, () =>
        HttpResponse.json({
          type: "memory",
          id: "mem_2",
          path: "/notes/a.md",
          content: "full content",
          content_sha256: "def",
          content_size_bytes: 4
        })
      )
    );

    const audit = await collectMemory(client());

    expect(audit.errors).toHaveLength(0);
    expect(audit.stores).toHaveLength(1);
    const memories = audit.stores[0]?.memories ?? [];
    expect(memories).toHaveLength(2); // prefix ignored
    // sorted by path: /notes/a.md before /prefs.md
    expect(memories[0]?.path).toBe("/notes/a.md");
    expect(memories[0]?.content).toBe("full content"); // fetched via retrieve
    expect(memories[1]?.content).toBe("inline"); // inline, no retrieve
  });

  it("returns no stores when the workspace has none", async () => {
    server.use(
      http.get(`${API}/memory_stores`, () => HttpResponse.json({ data: [], next_page: null }))
    );
    const audit = await collectMemory(client());
    expect(audit.stores).toHaveLength(0);
  });
});

describe("writeMemoryAudit", () => {
  it("writes each memory at its path plus a manifest", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brain-mem-"));
    try {
      await writeMemoryAudit(
        {
          stores: [
            {
              store: { id: "memstore_1", name: "Coach Memory" } as never,
              memories: [
                { id: "mem_2", path: "/notes/a.md", content: "hello", contentSha256: "def", bytes: 5 }
              ]
            }
          ],
          errors: []
        },
        dir,
        "2026-07-06T00:00:00.000Z"
      );

      const file = await fs.readFile(
        path.join(dir, "coach-memory", "memories", "notes", "a.md"),
        "utf8"
      );
      expect(file).toBe("hello");

      const manifest = JSON.parse(
        await fs.readFile(path.join(dir, "coach-memory", "manifest.json"), "utf8")
      );
      expect(manifest.memoryCount).toBe(1);
      expect(manifest.totalBytes).toBe(5);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
