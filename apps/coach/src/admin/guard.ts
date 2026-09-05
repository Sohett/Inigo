import { BASIC_AUTH_CHALLENGE, verifyBasicAuth } from "../auth";
import { getDeps } from "../deps";

/**
 * Re-check the admin credentials inside a route handler.
 *
 * `proxy.ts` already gates these paths, but authorization is not left to the proxy alone:
 * a matcher typo or a route that moves out from under it would otherwise open a write
 * endpoint silently. Returns the 401 response to send, or null when the caller is allowed.
 */
export function requireAdmin(request: Request): Response | null {
  const { config } = getDeps();
  if (verifyBasicAuth(request.headers.get("authorization"), config.ADMIN_USER, config.ADMIN_PASSWORD)) {
    return null;
  }
  return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", "WWW-Authenticate": BASIC_AUTH_CHALLENGE }
  });
}

/** JSON response helper, mirroring the shape the webhook route uses. */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
