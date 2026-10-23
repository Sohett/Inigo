import type { Athlete } from "../domain/athlete";

/**
 * Port for an athlete's user of the coach app (INI-87): what their magic link signs in. Created
 * by `createAthleteLink` before the athlete's first link, tied to them by `auth_user.athlete_id`.
 */
export interface AthleteAccountRepository {
  /** Create the athlete's user if they have none yet. Idempotent, and safe under concurrent calls. */
  ensure(athlete: Pick<Athlete, "id" | "displayName">): Promise<void>;
}
