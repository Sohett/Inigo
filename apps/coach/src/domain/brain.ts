/**
 * Coach-owned business model of the brain's session template.
 *
 * Deliberately independent of `@inigo/db` (same rule as `domain/athlete.ts`): these
 * are the Managed Agent control-plane pointers a new session is built from. They are
 * ids, never secrets — the credentials live in the vaults these ids point at.
 */

/** How a session may use the memory store attached to it. Mirrors the DB CHECK values. */
export type MemoryStoreAccess = "read_only" | "read_write";

export interface BrainSessionTemplate {
  /** The coordinator agent (`agent_…`) a new session runs. */
  coordinatorAgentId: string;
  /** The environment (`env_…`) the session runs in. */
  environmentId: string;
  /** Vaults (`vlt_…`) mounted on the session; they hold the MCP credentials. */
  vaultIds: string[];
  /** Shared memory store (`memstore_…`) attached as a resource, or null for none. */
  memoryStoreId: string | null;
  memoryStoreAccess: MemoryStoreAccess;
  /** When the template was last edited; surfaced in the admin, never used for logic. */
  updatedAt: Date;
}
