import { z } from "zod";
import type { ConnectionFlow } from "@/intervals/oauth/intervalsOAuth";

/**
 * The cookie holding a flow's `state` and PKCE verifier (INI-69, INI-73) between the click on
 * `/connect/intervals/start` and Intervals.icu's redirect to the callback. HttpOnly, Secure,
 * `SameSite=Lax` so it comes back on that top level redirect, and scoped to `/connect/intervals`.
 */
const COOKIE = "inigo_intervals_connect";

/** How long a flow lives: the time to log in on Intervals.icu and grant access. */
const TTL_SECONDS = 15 * 60;

const ATTRIBUTES = "Path=/connect/intervals; HttpOnly; Secure; SameSite=Lax";

const flowSchema = z.object({ state: z.string().min(1), codeVerifier: z.string().min(1) });

export function connectionFlowCookie(flow: ConnectionFlow): string {
  const value = Buffer.from(JSON.stringify(flowSchema.parse(flow))).toString("base64url");
  return `${COOKIE}=${value}; Max-Age=${TTL_SECONDS}; ${ATTRIBUTES}`;
}

export function clearConnectionFlowCookie(): string {
  return `${COOKIE}=; Max-Age=0; ${ATTRIBUTES}`;
}

/** The flow this browser started, or undefined when the cookie is absent or not one of ours. */
export function readConnectionFlow(request: Request): ConnectionFlow | undefined {
  const cookies = request.headers.get("cookie") ?? "";
  for (const pair of cookies.split(";")) {
    const [name, ...value] = pair.trim().split("=");
    if (name !== COOKIE) continue;
    try {
      const parsed = flowSchema.safeParse(JSON.parse(Buffer.from(value.join("="), "base64url").toString("utf8")));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Whether this request is the click on our own page's button. Without it, anyone could send
 * `/connect/intervals/start?t=<their token>` and skip the page that says whose account the link
 * connects. `Sec-Fetch-Site` when the browser sends it; otherwise the `Referer`, which the page
 * keeps for same origin requests only (`referrer: same-origin`).
 */
export function cameFromOurPage(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "same-origin";
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
