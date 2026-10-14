/**
 * Coach-owned business model of an athlete — the routing slice only.
 *
 * Deliberately independent of `@inigo/db`: the domain never imports DB types, so
 * the persistence layer (ORM, table shape) can change without touching business
 * logic. The Drizzle adapter maps a DB row onto this model (see `toAthlete`).
 */

/**
 * Lifecycle of an athlete. Mirrors the DB CHECK values, redeclared here so the domain owns its own enum.
 * `blocked`: the coach caught a hijack attempt or an off-coaching request (INI-66).
 */
export type AthleteStatus = "onboarding" | "active" | "paused" | "ended" | "blocked";

export interface Athlete {
  id: string;
  displayName: string | null;
  /**
   * WhatsApp number in E.164 (`+32…`): one alias of the athlete's WhatsApp account, learned from
   * a phone JID or from the gateway for a LID sender (INI-64). Null while unknown (hidden number).
   */
  phoneNum: string | null;
  /**
   * WhatsApp LID JID (`…@lid`): the other alias of the same account, learned from a LID JID.
   * Null until the athlete writes from their LID.
   */
  whatsappLid: string | null;
  /** Where replies go (the conversation JID as received), never an identity; null until the first inbound message. */
  chatId: string | null;
  status: AthleteStatus;
  /** IANA timezone the athlete lives in (`Europe/Brussels`): their local date and time in every turn. */
  timezone: string;
  /** The athlete's language (`fr`). */
  locale: string;
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

/**
 * A new athlete as WhatsApp first delivers them (INI-45): the aliases known so far, the chat
 * to reply to, and the onboarding session already opened for them.
 */
export interface NewOnboardingAthlete {
  phoneNum: string | null;
  whatsappLid: string | null;
  chatId: string;
  session: ActiveSession;
}

/**
 * Who sent a WhatsApp message, as far as the gateway can tell (INI-64). The number and the LID are
 * two aliases of one WhatsApp account, either of which may be missing: a LID can hide the number,
 * a phone JID never carries the LID. At least one is set.
 */
export interface SenderIdentity {
  /** E.164 (`+32…`), from a phone JID or resolved by the gateway for a LID sender. */
  phone: string | null;
  /** Full LID JID (`…@lid`). */
  lid: string | null;
}

/** What to record about a known sender: the aliases and the reply address that differ from what is stored. */
export interface SenderChanges {
  phoneNum?: string;
  whatsappLid?: string;
  chatId?: string;
}
