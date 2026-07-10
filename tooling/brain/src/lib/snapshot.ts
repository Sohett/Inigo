import path from "node:path";
import type { BrainClient } from "../client";
import { errorMessage, writeJsonFile } from "./util";

/** An error hit while collecting one resource (kept, not thrown, so a partial
 * snapshot is still produced and every failure is surfaced explicitly). */
export interface SnapshotError {
  resource: string;
  message: string;
}

type Agent = Awaited<ReturnType<BrainClient["beta"]["agents"]["retrieve"]>>;

export interface AgentDetail {
  id: string;
  config: Agent;
}

export interface BrainSnapshot {
  /** Every agent in the workspace (used to enumerate + count; not written to disk). */
  agents: unknown[];
  agentDetails: AgentDetail[];
  environments: unknown[];
  vaults: unknown[];
  memoryStores: unknown[];
  skills: unknown[];
  notes: string[];
  errors: SnapshotError[];
}

async function collectList<T>(
  resource: string,
  iter: AsyncIterable<T>,
  errors: SnapshotError[]
): Promise<T[]> {
  const out: T[] = [];
  try {
    for await (const item of iter) {
      out.push(item);
    }
  } catch (err) {
    errors.push({ resource, message: errorMessage(err) });
  }
  return out;
}

/**
 * Read-only: collect the brain architecture we version — every agent's full,
 * editable config (the target agent + its multiagent roster), plus environments,
 * vaults, memory stores and skills.
 *
 * Deliberately NOT collected: per-agent version history (kept server-side, the
 * current `version` is enough) and sessions (ephemeral runtime, inspected on
 * demand via `ant`/SDK — not versioned architecture). Never mutates anything;
 * individual resource failures are captured in `errors` rather than aborting.
 */
export async function collectSnapshot(
  client: BrainClient,
  opts: { agentId?: string } = {}
): Promise<BrainSnapshot> {
  const errors: SnapshotError[] = [];
  const notes: string[] = [];

  const agents = await collectList<unknown>("agents", client.beta.agents.list(), errors);
  const environments = await collectList<unknown>(
    "environments",
    client.beta.environments.list(),
    errors
  );
  const vaults = await collectList<unknown>("vaults", client.beta.vaults.list(), errors);
  const memoryStores = await collectList<unknown>(
    "memoryStores",
    client.beta.memoryStores.list(),
    errors
  );
  const skills = await collectList<unknown>("skills", client.beta.skills.list(), errors);

  // Start from the target agent (or every agent when none is pinned), then follow
  // each agent's multiagent roster so sub-agents are pulled in full too.
  const queue = opts.agentId
    ? [opts.agentId]
    : agents
        .map((a) => (a as { id?: string }).id)
        .filter((id): id is string => typeof id === "string");

  const fetched = new Set<string>();
  const agentDetails: AgentDetail[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || fetched.has(id)) continue;
    fetched.add(id);
    try {
      const config = await client.beta.agents.retrieve(id);
      agentDetails.push({ id, config });

      // Follow the multiagent coordinator roster (sub-agents referenced by id).
      const roster = (config as { multiagent?: { agents?: { id?: string }[] } | null }).multiagent;
      for (const ref of roster?.agents ?? []) {
        if (typeof ref.id === "string" && !fetched.has(ref.id)) queue.push(ref.id);
      }
    } catch (err) {
      errors.push({ resource: `agents/${id}`, message: errorMessage(err) });
    }
  }

  return {
    agents,
    agentDetails,
    environments,
    vaults,
    memoryStores,
    skills,
    notes,
    errors
  };
}

interface SnapshotSummary {
  fetchedAt: string;
  counts: Record<string, number>;
  agents: { id: string; name: unknown; version: unknown }[];
  memoryStores: { id: unknown; name: unknown }[];
  vaults: { id: unknown; name: unknown }[];
  notes: string[];
  errors: SnapshotError[];
}

function buildSummary(snapshot: BrainSnapshot, fetchedAt: string): SnapshotSummary {
  return {
    fetchedAt,
    counts: {
      agents: snapshot.agentDetails.length,
      environments: snapshot.environments.length,
      vaults: snapshot.vaults.length,
      memoryStores: snapshot.memoryStores.length,
      skills: snapshot.skills.length
    },
    agents: snapshot.agentDetails.map((d) => {
      const c = d.config as { name?: unknown; version?: unknown };
      return { id: d.id, name: c.name, version: c.version };
    }),
    memoryStores: snapshot.memoryStores.map((s) => {
      const m = s as { id?: unknown; name?: unknown };
      return { id: m.id, name: m.name };
    }),
    vaults: snapshot.vaults.map((v) => {
      const vv = v as { id?: unknown; display_name?: unknown };
      return { id: vv.id, name: vv.display_name };
    }),
    notes: snapshot.notes,
    errors: snapshot.errors
  };
}

/**
 * Write the snapshot to `dir` as git-diff-friendly JSON files. `fetchedAt` is
 * passed in (not read from the clock) so the writer stays deterministic.
 *
 * One file per agent under `agents/<id>.json` is the editable source of truth;
 * `index.json` is the summary. We deliberately do NOT write a flat `agents.json`
 * list (redundant with the per-agent files), per-agent version history, or
 * sessions (ephemeral runtime).
 */
export async function writeSnapshot(
  snapshot: BrainSnapshot,
  dir: string,
  fetchedAt: string
): Promise<void> {
  await writeJsonFile(path.join(dir, "index.json"), buildSummary(snapshot, fetchedAt));
  await writeJsonFile(path.join(dir, "environments.json"), snapshot.environments);
  await writeJsonFile(path.join(dir, "vaults.json"), snapshot.vaults);
  await writeJsonFile(path.join(dir, "memory-stores.json"), snapshot.memoryStores);
  await writeJsonFile(path.join(dir, "skills.json"), snapshot.skills);

  for (const detail of snapshot.agentDetails) {
    await writeJsonFile(path.join(dir, "agents", `${detail.id}.json`), detail.config);
  }

  if (snapshot.errors.length > 0) {
    await writeJsonFile(path.join(dir, "errors.json"), snapshot.errors);
  }
}
