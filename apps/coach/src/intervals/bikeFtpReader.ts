import type { ResolveClient } from "./mcp-tools/result";
import { toBikeFtp } from "./mappers/project";
import type { BikeFtpReader } from "../use-cases/assessOnboarding";

/** `BikeFtpReader` backed by the athlete's own Intervals.icu client (key resolved from Neon). */
export function createIntervalsBikeFtpReader(resolve: ResolveClient): BikeFtpReader {
  return async (athleteId: string): Promise<number | null> => {
    const client = await resolve(athleteId);
    return toBikeFtp(await client.getAthleteProfile());
  };
}
