import { IntervalsIcuClient, IntervalsIcuApiError } from "./client";
import type { IntervalsCredentialVerifier } from "../use-cases/connectIntervals";

/**
 * `IntervalsCredentialVerifier` over the Intervals.icu API: reading the athlete with the key
 * proves the key and the id belong together. Ids are dense, so a mistyped id usually hits a real
 * athlete the key cannot read (403) rather than a missing one (404). Only the refusals are translated; anything else
 * (5xx, timeout) is an outage and throws.
 */
export function createIntervalsCredentialVerifier(baseUrl: string): IntervalsCredentialVerifier {
  return {
    async check(apiKey, intervalsAthleteId) {
      const client = new IntervalsIcuClient({ apiKey, athleteId: intervalsAthleteId, baseUrl });
      try {
        const athlete = await client.getAthleteProfile();
        return { status: "valid", athleteName: athlete.name ?? null };
      } catch (error) {
        if (!(error instanceof IntervalsIcuApiError)) throw error;
        switch (error.status) {
          case 401:
            return { status: "invalid_credentials" };
          case 403:
            return { status: "credentials_mismatch" };
          case 404:
            return { status: "unknown_athlete_id" };
          default:
            throw error;
        }
      }
    }
  };
}
