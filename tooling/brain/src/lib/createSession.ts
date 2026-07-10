import type { BrainClient } from "../client";
import { ensureApply } from "./writeGuard";

type SessionCreateParams = Parameters<BrainClient["beta"]["sessions"]["create"]>[0];

/**
 * The elements a new session is created with. The agent is referenced by id (string),
 * which pins the agent's **latest** version at creation time — a session freezes that
 * config for its lifetime (only `tools`/`mcp_servers` can change later), so a fresh
 * session is how a new agent version actually takes effect.
 */
export interface CreateSessionInput {
  agentId: string;
  environmentId: string;
  vaultIds?: string[];
  resources?: SessionCreateParams["resources"];
  title?: string;
}

export interface CreateSessionResult {
  created: boolean;
  sessionId?: string;
  /** The concrete agent version the session captured (only known once created). */
  agentVersion?: number;
  /** The params that were (or would be) sent — surfaced for the dry-run report. */
  params: SessionCreateParams;
}

/**
 * Create a Managed Agent session with all its elements (environment, vaults, resources).
 * Read-only unless `apply` is true: in dry-run it returns the params it would send without
 * calling the API.
 */
export async function createSession(
  client: BrainClient,
  input: CreateSessionInput,
  apply: boolean
): Promise<CreateSessionResult> {
  const params = {
    agent: input.agentId,
    environment_id: input.environmentId,
    ...(input.vaultIds ? { vault_ids: input.vaultIds } : {}),
    ...(input.resources ? { resources: input.resources } : {}),
    ...(input.title ? { title: input.title } : {})
  } as SessionCreateParams;

  if (!apply) {
    return { created: false, params };
  }
  ensureApply(apply, "create session");

  const session = await client.beta.sessions.create(params);
  return {
    created: true,
    sessionId: session.id,
    agentVersion: session.agent.version,
    params
  };
}
