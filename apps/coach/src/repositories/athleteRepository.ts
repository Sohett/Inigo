import type { Athlete } from "../domain/athlete";

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
}
