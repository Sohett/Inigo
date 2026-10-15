import { getDeps } from "../../../../src/deps";
import { ConnectionResult } from "../../../../src/domain/intervalsConnection";
import { intervalsOAuthConfig } from "../../../../src/intervals/oauth/credentials";
import { createStartIntervalsConnection } from "../../../../src/use-cases/startIntervalsConnection";
import { browserNonceCookie } from "../_components/browser-nonce";

export const dynamic = "force-dynamic";

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ location, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

/**
 * The "Connecter Intervals.icu" button (INI-69): checks the link again, sets the browser nonce
 * cookie, and sends the athlete to Intervals.icu with the link bound to that nonce as `state`.
 * A link that cannot be used goes to the result page instead.
 */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t") ?? undefined;
  const done = (result: ConnectionResult) => {
    const url = new URL("/connect/intervals/done", request.url);
    url.searchParams.set("result", result);
    return redirect(url.toString());
  };

  try {
    const outcome = await createStartIntervalsConnection({ oauth: intervalsOAuthConfig(), repo: getDeps().repo }).execute(token);
    if (outcome.status !== "ready") return done(outcome.status);
    return redirect(outcome.authorizeUrl, browserNonceCookie(outcome.browserNonce));
  } catch (error) {
    console.error("[coach] could not start the Intervals.icu connection", error);
    return done(ConnectionResult.Failed);
  }
}
