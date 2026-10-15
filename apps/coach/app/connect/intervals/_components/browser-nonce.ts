import { BROWSER_NONCE_COOKIE, BROWSER_NONCE_TTL_SECONDS } from "@/intervals/oauth/connectLinkToken";

/**
 * The cookie binding an OAuth flow to the browser that started it (INI-69). HttpOnly, Secure,
 * `SameSite=Lax` so it comes back on Intervals.icu's top level redirect to the callback, and
 * scoped to `/connect/intervals`.
 */
const ATTRIBUTES = "Path=/connect/intervals; HttpOnly; Secure; SameSite=Lax";

export function browserNonceCookie(nonce: string): string {
  return `${BROWSER_NONCE_COOKIE}=${nonce}; Max-Age=${BROWSER_NONCE_TTL_SECONDS}; ${ATTRIBUTES}`;
}

export function clearBrowserNonceCookie(): string {
  return `${BROWSER_NONCE_COOKIE}=; Max-Age=0; ${ATTRIBUTES}`;
}

export function readBrowserNonce(request: Request): string | undefined {
  const cookies = request.headers.get("cookie") ?? "";
  for (const pair of cookies.split(";")) {
    const [name, ...value] = pair.trim().split("=");
    if (name === BROWSER_NONCE_COOKIE) return value.join("=") || undefined;
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
