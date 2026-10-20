import { getDeps } from "../../../../src/deps";
import { ConnectionResult } from "../../../../src/domain/intervalsConnection";
import { intervalsOAuth } from "../../../../src/intervals/oauth/intervalsOAuth";
import { createIntervalsAthleteReader } from "../../../../src/intervals/intervalsAthleteReader";
import {
  createDrizzleIntervalsAccountReader,
  createDrizzleIntervalsCredentialStore
} from "../../../../src/repositories/drizzleIntervalsCredentialStore";
import { clearConnectionFlowCookie, readConnectionFlow } from "../_components/connection-flow";
import { createDrizzleOnboardingFactsReader } from "../../../../src/repositories/drizzleOnboardingFactsReader";
import { createAssessOnboarding } from "../../../../src/use-cases/assessOnboarding";
import { createCompleteIntervalsConnection } from "../../../../src/use-cases/completeIntervalsConnection";

// The OAuth callback is per request and must never be cached.
export const dynamic = "force-dynamic";
// The code exchange, the write and the agent's turn are a few fast calls.
export const maxDuration = 30;

/**
 * Where Intervals.icu sends the athlete back (INI-69): `?code&state`, or `?error=access_denied`.
 * Thin: the use-case decides, this only redirects to the result page. An outage (Intervals.icu,
 * Neon) is logged and shown as a failure the athlete can retry from their link.
 */
export async function GET(request: Request): Promise<Response> {
  const callback = { query: new URL(request.url).searchParams, flow: readConnectionFlow(request) };

  let result: ConnectionResult;
  try {
    const deps = getDeps();
    const completeConnection = createCompleteIntervalsConnection({
      oauth: intervalsOAuth(),
      repo: deps.repo,
      store: createDrizzleIntervalsCredentialStore(deps.db, deps.config.DB_ENCRYPTION_KEY),
      connectedAccount: createDrizzleIntervalsAccountReader(deps.db),
      assessOnboarding: createAssessOnboarding({
        facts: createDrizzleOnboardingFactsReader(deps.db),
        intervals: createIntervalsAthleteReader(deps.intervalsResolver)
      }),
      brain: deps.brain
    });
    ({ result } = await completeConnection.execute(callback));
  } catch (error) {
    console.error("[coach] Intervals.icu OAuth callback failed", error);
    result = ConnectionResult.Failed;
  }

  const done = new URL("/connect/intervals/done", request.url);
  done.searchParams.set("result", result);
  return new Response(null, {
    status: 303,
    headers: {
      location: done.toString(),
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      // The binding is single use: whatever the result, a retry starts again from the link.
      "set-cookie": clearConnectionFlowCookie()
    }
  });
}
