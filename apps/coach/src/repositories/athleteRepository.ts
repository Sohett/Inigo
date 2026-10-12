import type { Athlete, AthleteSession, NewOnboardingAthlete } from "../domain/athlete";

/**
 * Port for athlete persistence. Business logic (the routing use-case) depends only
 * on this interface, never on the ORM — so the storage engine can be swapped by
 * providing a different adapter, with nothing else to change.
 */
export interface AthleteRepository {
  /** Resolve the athlete whose E.164 phone matches, or null if none is registered. */
  findByPhone(phoneNum: string): Promise<Athlete | null>;
  /** Resolve the athlete whose WhatsApp LID matches, or null if none is registered. */
  findByLid(whatsappLid: string): Promise<Athlete | null>;
  /** Persist the WhatsApp chat id learned on an inbound message. Idempotent. */
  setChatId(athleteId: string, chatId: string): Promise<void>;
  /** Resolve one athlete by internal id, or null if there is none. */
  findById(athleteId: string): Promise<Athlete | null>;
  /** Every athlete, oldest first — the admin roster. */
  listAll(): Promise<Athlete[]>;
  /**
   * Make a freshly created Managed Agent session the athlete's live one. The previous
   * live session is closed, not overwritten, so it stays in the history. Records the
   * agent id alongside so the history always says which agent each session runs.
   */
  setSession(athleteId: string, sessionId: string, agentId: string): Promise<void>;
  /** Every session the athlete has been routed to, newest first, the live one included. */
  listSessions(athleteId: string): Promise<AthleteSession[]>;
  /**
   * Create an athlete in `onboarding` together with their live session, atomically. Returns
   * null when the phone or LID is already registered (two first messages racing).
   */
  registerOnboardingAthlete(input: NewOnboardingAthlete): Promise<Athlete | null>;
  /**
   * End an athlete's onboarding (INI-49), atomically: they become `active` and the given
   * session, run by the coordinator, replaces their live one (closed, kept in the history).
   */
  completeOnboarding(athleteId: string, sessionId: string, agentId: string): Promise<void>;
}
