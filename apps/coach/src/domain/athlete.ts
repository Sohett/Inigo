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
  /**
   * The session this athlete's messages are appended to; null if none yet. Loaded with the
   * athlete in the same query (the history is only read by `listSessions`).
   */
  activeSession: ActiveSession | null;
}

/** The Managed Agent session an athlete is currently routed to. */
export interface ActiveSession {
  /** Managed Agent session (`sesn_…`). */
  sessionId: string;
  /** Managed Agent (`agent_…`) the session runs, the coordinator. */
  agentId: string;
}

/**
 * One Managed Agent session an athlete has been routed to. The history keeps every
 * session; the live one is the only one without `endedAt`.
 */
export interface AthleteSession extends ActiveSession {
  startedAt: Date;
  /** When a newer session replaced this one; null for the live session. */
  endedAt: Date | null;
}
