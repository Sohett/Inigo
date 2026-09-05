/**
 * Coach-owned business model of the brain's control plane.
 *
 * Deliberately independent of the Anthropic SDK (same rule as `domain/athlete.ts` is
 * independent of `@inigo/db`): the adapter in `brain/managedAgents.ts` maps the wire
 * shapes onto these. Everything here is an id or a label, never a secret.
 *
 * Nothing of this is persisted. The elements a session runs on are read back from the
 * live session itself, which is the only copy that cannot drift.
 */

/** How a session may use a memory store attached to it. */
export type MemoryStoreAccess = "read_only" | "read_write";

/**
 * A resource mounted in a session. Only the shapes the API lets us *recreate* are
 * modelled: a `github_repository` needs an authorization token that reads never return,
 * so it cannot be cloned and is rejected loudly instead of silently dropped.
 */
export type SessionResource =
  | {
      kind: "memory_store";
      memoryStoreId: string;
      access: MemoryStoreAccess;
      instructions: string | null;
    }
  | { kind: "file"; fileId: string; mountPath: string | null };

/** The elements a session runs on: what to send to recreate an equivalent one. */
export interface SessionElements {
  agentId: string;
  environmentId: string;
  vaultIds: string[];
  resources: SessionResource[];
}

/** A session that exists in the control plane, with the agent snapshot it captured. */
export interface RunningSession extends SessionElements {
  sessionId: string;
  /** The agent's name at creation time, for display. */
  agentName: string;
  /** The version the session froze. A newer agent version has no effect until a new session. */
  agentVersion: number;
  status: string;
}

/** One selectable element in the control plane. */
export interface BrainElement {
  id: string;
  name: string;
}

/** An agent, with the hint that lets the admin spot the coordinator among the roster. */
export interface BrainAgent extends BrainElement {
  version: number;
  /** True when the agent carries a `multiagent` roster, i.e. it delegates to sub-agents. */
  isCoordinator: boolean;
}

/**
 * What exists in the control plane right now. Read live, never stored: it is only needed
 * to open a *first* session for an athlete who has none to clone.
 */
export interface BrainInventory {
  agents: BrainAgent[];
  environments: BrainElement[];
  vaults: BrainElement[];
  memoryStores: BrainElement[];
}
