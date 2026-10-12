import type { Athlete } from "./client";
import type { ResolveClient } from "./mcp-tools/result";
import type { BikeFtpReader } from "../use-cases/assessOnboarding";

/**
 * The bike FTP set on an Intervals.icu athlete, in watts, or null when none is set. The
 * bike settings are the ones that apply to the `Ride` activity type.
 */
export function bikeFtpOf(athlete: Athlete): number | null {
  const bike = athlete.sportSettings?.find((settings) => settings.types?.includes("Ride"));
  const ftp = bike?.ftp;
  return ftp !== null && ftp !== undefined && ftp > 0 ? ftp : null;
}

/** `BikeFtpReader` backed by the athlete's own Intervals.icu client (key resolved from Neon). */
export function createIntervalsBikeFtpReader(resolve: ResolveClient): BikeFtpReader {
  return async (athleteId: string): Promise<number | null> => {
    const client = await resolve(athleteId);
    return bikeFtpOf(await client.getAthleteProfile());
  };
}
