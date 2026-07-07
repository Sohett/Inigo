import Anthropic from "@anthropic-ai/sdk";
import type { BrainClient } from "../client";
import { ensureApply } from "./writeGuard";

type AgentUpdateParams = Parameters<BrainClient["beta"]["agents"]["update"]>[1];

/** Fields an update may change. Server-managed fields (id, version, timestamps)
 * are never sent. Array fields are fully replaced by the API. */
const UPDATABLE_FIELDS = [
  "name",
  "model",
  "system",
  "tools",
  "mcp_servers",
  "skills",
  "description",
  "metadata"
] as const;

export interface ApplyAgentPlan {
  agentId: string;
  currentVersion: number;
  changedFields: string[];
  updateFields: Record<string, unknown>;
}

export interface ApplyAgentResult {
  plan: ApplyAgentPlan;
  applied: boolean;
  newVersion?: number;
}

export class AgentVersionConflictError extends Error {
  constructor(agentId: string) {
    super(
      `Conflit de version sur l'agent ${agentId} (409) : la version en ligne a changé depuis ` +
        `le snapshot. Relance brain:pull pour resynchroniser, puis ré-applique.`
    );
    this.name = "AgentVersionConflictError";
  }
}

/**
 * Push an edited agent config as a new version. Read-only unless `apply` is true.
 * Uses the current version for optimistic concurrency (a 409 becomes a clear
 * AgentVersionConflictError).
 */
export async function applyAgent(
  client: BrainClient,
  input: { agentId: string; config: Record<string, unknown> },
  apply: boolean
): Promise<ApplyAgentResult> {
  const current = await client.beta.agents.retrieve(input.agentId);
  const currentVersion = current.version;

  const updateFields: Record<string, unknown> = {};
  const changedFields: string[] = [];
  const currentRecord = current as unknown as Record<string, unknown>;
  for (const field of UPDATABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input.config, field)) continue;
    updateFields[field] = input.config[field];
    if (JSON.stringify(input.config[field]) !== JSON.stringify(currentRecord[field])) {
      changedFields.push(field);
    }
  }

  const plan: ApplyAgentPlan = {
    agentId: input.agentId,
    currentVersion,
    changedFields,
    updateFields
  };

  if (!apply) {
    return { plan, applied: false };
  }
  ensureApply(apply, `apply agent ${input.agentId}`);

  const params = { version: currentVersion, ...updateFields } as unknown as AgentUpdateParams;
  try {
    const updated = await client.beta.agents.update(input.agentId, params);
    return { plan, applied: true, newVersion: updated.version };
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status === 409) {
      throw new AgentVersionConflictError(input.agentId);
    }
    throw err;
  }
}
