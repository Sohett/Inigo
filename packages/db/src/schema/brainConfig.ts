import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import type { MemoryStoreAccess } from "./types";

/**
 * The template every new Managed Agent session is created from: which agent runs
 * (the coordinator), in which environment, with which vaults and which memory store.
 *
 * These pointers live in the database rather than in env so the app itself can read
 * and update them (the admin can re-point the brain without a redeploy). They are
 * ids into Anthropic's control plane, not secrets — the vault holds the secrets.
 *
 * One brain, so one row: `id` is pinned to 'default' by a CHECK, which makes the
 * write a plain upsert on a known key and removes any "which row is live?" question.
 */
export const brainConfig = pgTable(
  "brain_config",
  {
    id: text("id").primaryKey().default("default"),
    /** The coordinator agent (`agent_…`) a session is created on. */
    coordinatorAgentId: text("coordinator_agent_id").notNull(),
    /** The environment (`env_…`) the session runs in. */
    environmentId: text("environment_id").notNull(),
    /** Vaults (`vlt_…`) mounted on the session, holding the MCP credentials. */
    vaultIds: text("vault_ids").array().notNull().default(sql`'{}'`),
    /** Shared memory store (`memstore_…`) attached as a session resource, or null for none. */
    memoryStoreId: text("memory_store_id"),
    memoryStoreAccess: text("memory_store_access")
      .$type<MemoryStoreAccess>()
      .notNull()
      .default("read_only"),
    ...timestamps()
  },
  (t) => [
    check("brain_config_singleton_check", sql`${t.id} = 'default'`),
    check(
      "brain_config_memory_access_check",
      sql`${t.memoryStoreAccess} in ('read_only', 'read_write')`
    )
  ]
);
