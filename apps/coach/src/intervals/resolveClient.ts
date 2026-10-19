import { getIntervalsCredential, type Db, type IntervalsCredential } from "@inigo/db";
import { IntervalsIcuClient, type IntervalsAuth } from "./client";
import type { ResolveClient } from "./mcp-tools/result";

/** How a stored credential authenticates against Intervals.icu. */
function authOf(credential: IntervalsCredential): IntervalsAuth {
  switch (credential.authType) {
    case "api_key":
      return { type: "api_key", apiKey: credential.secret };
    case "oauth":
      return { type: "oauth", accessToken: credential.secret };
  }
}

/**
 * Build the per-request Intervals.icu client resolver for the MCP tools. Given an Inigo
 * `athleteId`, it fetches that athlete's credential from Neon and decrypts it here, at the
 * moment of use — the plaintext secret (API key or OAuth token) never leaves this process and
 * never reaches the LLM.
 *
 * Throws (surfaced as a clean tool error, never leaking the secret) when the athlete has no
 * stored credential, or a credential without the Intervals.icu athlete id needed for the API.
 */
export function createIntervalsResolver(
  db: Db,
  masterKeyBase64: string,
  baseUrl: string
): ResolveClient {
  return async (athleteId: string): Promise<IntervalsIcuClient> => {
    const credential = await getIntervalsCredential(db, athleteId, masterKeyBase64);
    if (!credential) {
      throw new Error(
        `No Intervals.icu credential stored for athlete ${athleteId}. Connect the athlete's ` +
          `Intervals.icu account before calling Intervals tools.`
      );
    }
    if (!credential.externalAthleteId) {
      throw new Error(
        `Intervals.icu credential for athlete ${athleteId} is missing the Intervals athlete id ` +
          `(e.g. i123456); cannot call the API.`
      );
    }
    return new IntervalsIcuClient({
      auth: authOf(credential),
      athleteId: credential.externalAthleteId,
      baseUrl
    });
  };
}
