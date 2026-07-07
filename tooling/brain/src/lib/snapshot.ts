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
  versions: Agent[];
}

export interface BrainSnapshot {
  agents: unknown[];
  agentDetails: AgentDetail[];
  environments: unknown[];
  sessions: unknown[];
  vaults: unknown[];
  memoryStores: unknown[];
  skills: unknown[];
  notes: string[];
  errors: SnapshotError[];
}

/** Cap on how many sessions to pull (metadata only); truncation is surfaced. */
const SESSION_LIMIT = 200;

async function collectList<T>(
  resource: string,
  iter: AsyncIterable<T>,
  errors: SnapshotError[],
  max = Number.POSITIVE_INFINITY
): Promise<T[]> {
  const out: T[] = [];
  try {
    for await (const item of iter) {
      out.push(item);
      if (out.length >= max) break;
    }
  } catch (err) {
    errors.push({ resource, message: errorMessage(err) });
  }
  return out;
}

/**
 * Read-only: collect the whole brain architecture from the workspace — every
 * agent (+ full config and version history for the target agent(s)),
 * environments, sessions (capped), vaults, memory stores and skills.
 *
 * Never mutates anything. Individual resource failures are captured in `errors`
 * rather than aborting the whole snapshot.
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
  const sessions = await collectList<unknown>(
    "sessions",
    client.beta.sessions.list(),
    errors,
    SESSION_LIMIT
  );
  if (sessions.length >= SESSION_LIMIT) {
    notes.push(`sessions tronquées à ${SESSION_LIMIT} (il en existe peut-être davantage).`);
  }
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
      const versions = await collectList<Agent>(
        `agents/${id}/versions`,
        client.beta.agents.versions.list(id),
        errors
      );
      agentDetails.push({ id, config, versions });

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
    sessions,
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
  agents: { id: string; name: unknown; version: unknown; versionCount: number }[];
  memoryStores: { id: unknown; name: unknown }[];
  vaults: { id: unknown; name: unknown }[];
  notes: string[];
  errors: SnapshotError[];
}

function buildSummary(snapshot: BrainSnapshot, fetchedAt: string): SnapshotSummary {
  return {
    fetchedAt,
    counts: {
      agents: snapshot.agents.length,
      environments: snapshot.environments.length,
      sessions: snapshot.sessions.length,
      vaults: snapshot.vaults.length,
      memoryStores: snapshot.memoryStores.length,
      skills: snapshot.skills.length
    },
    agents: snapshot.agentDetails.map((d) => {
      const c = d.config as { name?: unknown; version?: unknown };
      return { id: d.id, name: c.name, version: c.version, versionCount: d.versions.length };
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
 */
export async function writeSnapshot(
  snapshot: BrainSnapshot,
  dir: string,
  fetchedAt: string
): Promise<void> {
  await writeJsonFile(path.join(dir, "index.json"), buildSummary(snapshot, fetchedAt));
  await writeJsonFile(path.join(dir, "agents.json"), snapshot.agents);
  await writeJsonFile(path.join(dir, "environments.json"), snapshot.environments);
  await writeJsonFile(path.join(dir, "sessions.json"), snapshot.sessions);
  await writeJsonFile(path.join(dir, "vaults.json"), snapshot.vaults);
  await writeJsonFile(path.join(dir, "memory-stores.json"), snapshot.memoryStores);
  await writeJsonFile(path.join(dir, "skills.json"), snapshot.skills);

  for (const detail of snapshot.agentDetails) {
    await writeJsonFile(path.join(dir, "agents", `${detail.id}.json`), detail.config);
    await writeJsonFile(path.join(dir, "agents", `${detail.id}.versions.json`), detail.versions);
  }

  if (snapshot.errors.length > 0) {
    await writeJsonFile(path.join(dir, "errors.json"), snapshot.errors);
  }
}
