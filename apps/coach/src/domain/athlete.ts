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
  /** WhatsApp number in E.164 (`+32…`). A routing key. */
  phoneNum: string;
  /**
   * WhatsApp LID JID (`…@lid`) for senders identified by a linked id instead of
   * a phone number; a routing key alongside `phoneNum`. Null until known.
   */
  whatsappLid: string | null;
  /** WhatsApp chat id the agent replies to; null until the first inbound message. */
  chatId: string | null;
  status: AthleteStatus;
  /** Live Managed Agent session (`sesn_…`) this athlete's messages are appended to; null if none yet. */
  anthropicSessionId: string | null;
  /** Managed Agent (`agent_…`) the live session runs, the coordinator; null if no session. */
  managedAgentId: string | null;
}

/**
 * One Managed Agent session an athlete has been routed to. The history keeps every
 * session; the live one is the only one without `endedAt`.
 */
export interface AthleteSession {
  /** Managed Agent session (`sesn_…`). */
  sessionId: string;
  /** Managed Agent (`agent_…`) the session runs, the coordinator. */
  agentId: string;
  startedAt: Date;
  /** When a newer session replaced this one; null for the live session. */
  endedAt: Date | null;
}
