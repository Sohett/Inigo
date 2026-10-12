import { setIntervalsKey, type Db } from "@inigo/db";
import type { IntervalsCredentialStore } from "../use-cases/connectIntervals";

/** `IntervalsCredentialStore` over `setIntervalsKey`: the key is sealed with the master key, the id kept in clear. */
export function createDrizzleIntervalsCredentialStore(db: Db, masterKeyBase64: string): IntervalsCredentialStore {
  return {
    save: (athleteId, apiKey, intervalsAthleteId) =>
      setIntervalsKey(db, { athleteId, apiKey, externalAthleteId: intervalsAthleteId }, masterKeyBase64)
  };
}
