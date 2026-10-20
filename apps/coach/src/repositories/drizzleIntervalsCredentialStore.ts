import { getIntervalsAccountId, setIntervalsCredential, type Db } from "@inigo/db";
import type { IntervalsAccountReader, IntervalsCredentialStore } from "../use-cases/completeIntervalsConnection";

/** The Postgres code of a failed write, read from the driver error or Drizzle's wrapper. */
function postgresCode(error: unknown): string {
  const codeOf = (value: unknown): unknown =>
    value !== null && typeof value === "object" ? (value as { code?: unknown }).code : undefined;
  const code = codeOf(error) ?? codeOf(error instanceof Error ? error.cause : undefined);
  return typeof code === "string" ? code : "unknown";
}

/**
 * `IntervalsCredentialStore` over `setIntervalsCredential`: the token is sealed with the master key, the
 * id kept in clear. A failed write never surfaces its own error: Drizzle puts the query params,
 * the sealed token among them, in the message, and that message would reach the agent. Only the
 * Postgres code is logged.
 */
export function createDrizzleIntervalsCredentialStore(db: Db, masterKeyBase64: string): IntervalsCredentialStore {
  return {
    async save(athleteId, accessToken, intervalsAthleteId) {
      try {
        await setIntervalsCredential(
          db,
          { athleteId, secret: accessToken, externalAthleteId: intervalsAthleteId },
          masterKeyBase64
        );
      } catch (error) {
        console.error(`[coach] could not save the Intervals.icu credential (postgres code ${postgresCode(error)})`);
        throw new Error("Could not save the Intervals.icu credential. Try again in a moment.");
      }
    }
  };
}

/** `IntervalsAccountReader` over `getIntervalsAccountId`: which Intervals.icu account, no secret read. */
export function createDrizzleIntervalsAccountReader(db: Db): IntervalsAccountReader {
  return (athleteId) => getIntervalsAccountId(db, athleteId);
}
