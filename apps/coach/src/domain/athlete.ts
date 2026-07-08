/**
 * Coach-owned business model of an athlete — the routing slice only.
 *
 * Deliberately independent of `@inigo/db`: the domain never imports DB types, so
 * the persistence layer (ORM, table shape) can change without touching business
 * logic. The Drizzle adapter maps a DB row onto this model (see `toAthlete`).
 */

/** Lifecycle of an athlete. Mirrors the DB CHECK values, redeclared here so the domain owns its own enum. */
export type AthleteStatus = "active" | "paused" | "ended";

export interface Athlete {
  id: string;
  displayName: string | null;
  /** WhatsApp number in E.164 (`+32…`). The routing key. */
  phoneNum: string;
  /** WhatsApp chat id the agent replies to; null until the first inbound message. */
  chatId: string | null;
  status: AthleteStatus;
  /** Managed Agent session (`sesn_…`) this athlete's messages are appended to; null if none yet. */
  anthropicSessionId: string | null;
  /** Managed Agent (`agent_…`), the coordinator. */
  managedAgentId: string | null;
}
