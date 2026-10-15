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
