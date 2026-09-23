import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import { timestamps } from "./columns";

/**
 * Every Managed Agent session an athlete has been routed to, the live one included.
 *
 * Opening a new session (to pick up a new agent version) closes the previous one rather
 * than overwriting it, so the history stays traceable: the old sessions remain readable
 * at Anthropic, and this table says which ones belonged to whom and when.
 *
 * The live session is the row with `ended_at` null. A partial unique index makes the
 * database refuse a second one, so "at most one active session per athlete" does not
 * rest on the application alone.
 *
 * Only ids and lifecycle live here: the session's own config (agent version, environment,
 * vaults, resources) is read from the live session at Anthropic, never duplicated.
 */
export const athleteSession = pgTable(
  "athlete_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athlete.id, { onDelete: "cascade" }),
    /** Managed Agent session (`sesn_…`). */
    anthropicSessionId: text("anthropic_session_id").notNull().unique(),
    /** Managed Agent (`agent_…`) the session runs, the coordinator. */
    managedAgentId: text("managed_agent_id").notNull(),
    /** When a newer session replaced this one; null while it is the live session. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps()
  },
  (t) => [
    index("athlete_session_athlete_idx").on(t.athleteId),
    uniqueIndex("athlete_session_one_active_idx").on(t.athleteId).where(sql`${t.endedAt} is null`)
  ]
);
