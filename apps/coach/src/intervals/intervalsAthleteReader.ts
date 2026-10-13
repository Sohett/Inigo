import type { ResolveClient } from "./mcp-tools/result";
import { IntervalsIcuApiError } from "./client";
import { toBikeFtp, toBodyComplete } from "./mappers/project";
import type { IntervalsAthleteReader } from "../use-cases/assessOnboarding";

/**
 * `IntervalsAthleteReader` backed by the athlete's own Intervals.icu client (key resolved from
 * Neon): one profile read answers both the FTP and the physiology checks.
 *
 * An Intervals.icu refusal or outage reads as "unknown" (null) instead of throwing: the
 * onboarding turn still reaches the agent, which can then ask the athlete to reconnect (revoked
 * key) or retry later, while the Intervals.icu checks simply stay missing.
 */
export function createIntervalsAthleteReader(resolve: ResolveClient): IntervalsAthleteReader {
  return async (athleteId: string) => {
    const client = await resolve(athleteId);
    try {
      const athlete = await client.getAthleteProfile();
      return { bikeFtpWatts: toBikeFtp(athlete), bodyComplete: toBodyComplete(athlete) };
    } catch (error) {
      if (!(error instanceof IntervalsIcuApiError)) throw error;
      console.warn(
        `[onboarding] Intervals.icu unreadable for athlete ${athleteId} (${error.status} ${error.endpoint}): its checks stay missing`
      );
      return null;
    }
  };
}
