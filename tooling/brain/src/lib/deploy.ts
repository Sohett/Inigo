import { z } from "zod";
import type { BrainClient } from "../client";
import { applyAgent } from "./applyAgent";
import { createSession, type CreateSessionInput } from "./createSession";

/**
 * A brain deploy manifest: the ordered set of agents to push and the template for the
 * fresh session that runs the deployed coordinator. Sub-agents are applied first, then
 * the coordinator (with its roster re-pinned to the new sub-agent versions), then a new
 * session is created — the only way a new agent version actually takes effect at runtime.
 */
export const deployManifestSchema = z.object({
  /** The coordinator agent id; its `multiagent` roster is re-pinned to the applied sub-agents. */
  coordinator: z.string().min(1),
  /** Sub-agent ids, applied in order before the coordinator. */
  subAgents: z.array(z.string().min(1)),
  /** Template for the fresh session created on the deployed coordinator. */
  session: z.object({
    environmentId: z.string().min(1),
    vaultIds: z.array(z.string().min(1)).optional(),
    resources: z
      .array(
        z.object({
          type: z.literal("memory_store"),
          memory_store_id: z.string().min(1),
          access: z.enum(["read_write", "read_only"]).optional(),
          instructions: z.string().optional()
        })
      )
      .optional()
  })
});

export type DeployManifest = z.infer<typeof deployManifestSchema>;

export interface DeployInput {
  manifest: DeployManifest;
  /** Snapshot config keyed by agent id — the coordinator plus every sub-agent. */
  agentConfigs: Record<string, Record<string, unknown>>;
}

export interface AgentDeployReport {
  id: string;
  fromVersion: number;
  toVersion: number;
  changed: string[];
}

export interface DeployReport {
  subAgents: AgentDeployReport[];
  coordinator: AgentDeployReport & { repinned: Array<{ id: string; version: number }> };
  session: { created: boolean; sessionId?: string; agentVersion?: number };
}

/** The version an apply lands on: the real new version when applied, else the prediction
 * (agent versions auto-increment by 1, and only a real config change bumps them). */
function effectiveVersion(
  currentVersion: number,
  changedFields: string[],
  applied: boolean,
  newVersion: number | undefined
): number {
  if (applied) return newVersion ?? currentVersion;
  return currentVersion + (changedFields.length > 0 ? 1 : 0);
}

/** Re-pin the coordinator's multiagent roster to the given sub-agent versions (in place).
 * Returns the roster entries that were touched (id + version now pinned). */
function repinRoster(
  coordinatorConfig: Record<string, unknown>,
  versions: Map<string, number>
): Array<{ id: string; version: number }> {
  const multiagent = coordinatorConfig.multiagent as
    | { type?: string; agents?: Array<{ id: string; type: string; version?: number }> }
    | null
    | undefined;
  const repinned: Array<{ id: string; version: number }> = [];
  if (!multiagent?.agents) return repinned;
  for (const entry of multiagent.agents) {
    const version = versions.get(entry.id);
    if (version === undefined) continue;
    entry.version = version;
    repinned.push({ id: entry.id, version });
  }
  return repinned;
}

/**
 * Run a full brain deploy: apply sub-agents, re-pin the coordinator roster to their new
 * versions and apply it, then create a fresh session on the deployed coordinator.
 * Read-only unless `apply` is true (each step is individually gated, so a dry-run performs
 * only reads and returns the predicted plan).
 */
export async function deployBrain(
  client: BrainClient,
  input: DeployInput,
  apply: boolean
): Promise<DeployReport> {
  const { manifest, agentConfigs } = input;

  // 1. Apply each sub-agent from its snapshot; collect the version each lands on.
  const subAgents: AgentDeployReport[] = [];
  const versions = new Map<string, number>();
  for (const id of manifest.subAgents) {
    const config = agentConfigs[id];
    if (!config) throw new Error(`Deploy manifest references sub-agent ${id} with no snapshot config.`);
    const result = await applyAgent(client, { agentId: id, config }, apply);
    const to = effectiveVersion(
      result.plan.currentVersion,
      result.plan.changedFields,
      result.applied,
      result.newVersion
    );
    versions.set(id, to);
    subAgents.push({ id, fromVersion: result.plan.currentVersion, toVersion: to, changed: result.plan.changedFields });
  }

  // 2. Re-pin the coordinator roster to those versions, then apply the coordinator.
  const coordinatorConfig = agentConfigs[manifest.coordinator];
  if (!coordinatorConfig) {
    throw new Error(`Deploy manifest references coordinator ${manifest.coordinator} with no snapshot config.`);
  }
  const repinned = repinRoster(coordinatorConfig, versions);
  const coordResult = await applyAgent(
    client,
    { agentId: manifest.coordinator, config: coordinatorConfig },
    apply
  );
  const coordTo = effectiveVersion(
    coordResult.plan.currentVersion,
    coordResult.plan.changedFields,
    coordResult.applied,
    coordResult.newVersion
  );

  // 3. Create a fresh session on the deployed coordinator (latest version).
  const sessionInput: CreateSessionInput = {
    agentId: manifest.coordinator,
    environmentId: manifest.session.environmentId,
    vaultIds: manifest.session.vaultIds,
    resources: manifest.session.resources,
    title: `Inigo Coach Coordinator v.${coordTo}`
  };
  const session = await createSession(client, sessionInput, apply);

  return {
    subAgents,
    coordinator: {
      id: manifest.coordinator,
      fromVersion: coordResult.plan.currentVersion,
      toVersion: coordTo,
      changed: coordResult.plan.changedFields,
      repinned
    },
    session: {
      created: session.created,
      sessionId: session.sessionId,
      agentVersion: session.agentVersion
    }
  };
}
