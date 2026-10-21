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

/**
 * Where a session stands in the control plane. Mirrors the API's values, redeclared here so the
 * domain owns its own enum. `running` and `rescheduling` mean a turn is in progress.
 */
export const SessionStatus = {
  Idle: "idle",
  Running: "running",
  Rescheduling: "rescheduling",
  Terminated: "terminated"
} as const;

export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

/** A session that exists in the control plane, with the agent snapshot it captured. */
export interface RunningSession extends SessionElements {
  sessionId: string;
  /** The agent's name at creation time, for display. */
  agentName: string;
  /** The version the session froze. A newer agent version has no effect until a new session. */
  agentVersion: number;
  status: SessionStatus;
}

/** Who wrote a message of the WhatsApp conversation an athlete had with the coach. */
export type ConversationAuthor = "athlete" | "coach";

/**
 * One entry of what a session exchanged over WhatsApp, as recorded by the session itself. For the
 * athlete, `text` is the whole turn the backend appended (the envelope); for the coach, it is the
 * text of a `send_whatsapp_message` call, i.e. exactly what the athlete read.
 */
export interface SessionExchange {
  author: ConversationAuthor;
  text: string;
  at: Date;
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
