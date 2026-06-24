import { loadConfig, type Config } from "@inigo/shared-config";
import { IntervalsIcuClient } from "@inigo/intervals-icu-client";

interface Deps {
  config: Config;
  client: IntervalsIcuClient;
}

let cached: Deps | null = null;

/**
 * Lazily build and cache the validated config + Intervals.icu client.
 *
 * Deferred to first request (rather than module load) so the Next.js build does
 * not fail when secrets are absent at build time.
 */
export function getDeps(): Deps {
  if (cached === null) {
    const config = loadConfig();
    cached = {
      config,
      client: new IntervalsIcuClient({
        apiKey: config.INTERVALS_API_KEY,
        athleteId: config.INTERVALS_ATHLETE_ID,
        baseUrl: config.INTERVALS_BASE_URL
      })
    };
  }
  return cached;
}
