import { getIntervalsKey, type Db } from "@inigo/db";
import { IntervalsIcuClient } from "./client";
import type { ResolveClient } from "./mcp-tools/result";

/**
 * Build the per-request Intervals.icu client resolver for the MCP tools. Given an Inigo
 * `athleteId`, it fetches that athlete's credential from Neon and decrypts it here, at the
 * moment of use — the plaintext key never leaves this process and never reaches the LLM.
 *
 * Throws (surfaced as a clean tool error, never leaking the key) when the athlete has no
 * stored credential, or a credential without the Intervals.icu athlete id needed for the API.
 */
export function createIntervalsResolver(
  db: Db,
  masterKeyBase64: string,
  baseUrl: string
): ResolveClient {
  return async (athleteId: string): Promise<IntervalsIcuClient> => {
    const credential = await getIntervalsKey(db, athleteId, masterKeyBase64);
    if (!credential) {
      throw new Error(
        `No Intervals.icu credential stored for athlete ${athleteId}. Register the athlete's ` +
          `API key before calling Intervals tools.`
      );
    }
    if (!credential.externalAthleteId) {
      throw new Error(
        `Intervals.icu credential for athlete ${athleteId} is missing the Intervals athlete id ` +
          `(e.g. i123456); cannot call the API.`
      );
    }
    return new IntervalsIcuClient({
      apiKey: credential.apiKey,
      athleteId: credential.externalAthleteId,
      baseUrl
    });
  };
}
