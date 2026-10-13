import type { ResolveClient } from "./mcp-tools/result";
import { toBikeFtp, toBodyComplete } from "./mappers/project";
import type { IntervalsAthleteReader } from "../use-cases/assessOnboarding";

/**
 * `IntervalsAthleteReader` backed by the athlete's own Intervals.icu client (key resolved from
 * Neon): one profile read answers both the FTP and the physiology checks.
 */
export function createIntervalsAthleteReader(resolve: ResolveClient): IntervalsAthleteReader {
  return async (athleteId: string) => {
    const client = await resolve(athleteId);
    const athlete = await client.getAthleteProfile();
    return { bikeFtpWatts: toBikeFtp(athlete), bodyComplete: toBodyComplete(athlete) };
  };
}
