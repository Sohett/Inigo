import { getDeps } from "../../../../src/deps";
import { ConnectionResult } from "../../../../src/domain/intervalsConnection";
import { intervalsOAuth } from "../../../../src/intervals/oauth/intervalsOAuth";
import { whoIsSignedIn } from "../../../../src/identity/sessions";
import { createStartIntervalsConnection } from "../../../../src/use-cases/startIntervalsConnection";
import { cameFromOurPage, connectionFlowCookie } from "../_components/connection-flow";

export const dynamic = "force-dynamic";

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ location, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

/**
 * The "Connecter Intervals.icu" button (INI-69): checks the athlete's session again (INI-85),
 * keeps the flow (`state` and PKCE verifier) in a cookie, and sends the athlete to Intervals.icu.
 * No session goes to the result page instead, and a request that did not come from the page goes
 * back to it, so the athlete always sees whose account they connect.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cameFromOurPage(request)) return redirect(new URL("/connect/intervals", request.url).toString());
  const done = (result: ConnectionResult) => {
    const url = new URL("/connect/intervals/done", request.url);
    url.searchParams.set("result", result);
    return redirect(url.toString());
  };

  try {
    const signedIn = await whoIsSignedIn(request.headers);
    const outcome = await createStartIntervalsConnection({ oauth: intervalsOAuth(), repo: getDeps().repo }).execute({
      signedIn,
      linkFailed: false
    });
    if (outcome.status !== "ready") return done(outcome.status);
    return redirect(outcome.authorizeUrl, connectionFlowCookie(outcome.flow));
  } catch (error) {
    console.error("[coach] could not start the Intervals.icu connection", error);
    return done(ConnectionResult.Failed);
  }
}
