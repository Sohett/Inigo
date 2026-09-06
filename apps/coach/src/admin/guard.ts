import {
  adminCredentials,
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_USER_MIN_LENGTH,
  BASIC_AUTH_CHALLENGE,
  verifyBasicAuth
} from "../auth";

/** JSON response helper, mirroring the shape the webhook route uses. */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/**
 * Re-check the admin credentials inside a route handler.
 *
 * `proxy.ts` already gates these paths, but authorization is not left to the proxy alone:
 * a matcher typo or a route that moves out from under it would otherwise open a write
 * endpoint silently.
 *
 * Reads the credentials directly rather than through `getDeps()`, so the admin gate never
 * depends on unrelated configuration — and, symmetrically, so the rest of the app never
 * depends on the admin's. Fails closed: no credentials configured means nobody gets in.
 *
 * Returns the response to send, or null when the caller is allowed through.
 */
export function requireAdmin(request: Request): Response | null {
  const credentials = adminCredentials();
  if (!credentials) {
    // One template literal, not a concatenation: Turbopack folded the two-part version
    // into a truncated message, and this is the line an operator reads when admin is down.
    console.error(
      `[coach] admin refuses to serve. Set ADMIN_USER (min ${ADMIN_USER_MIN_LENGTH} chars) and ADMIN_PASSWORD (min ${ADMIN_PASSWORD_MIN_LENGTH} chars).`
    );
    return json({ ok: false, error: "admin_not_configured" }, 503);
  }

  if (verifyBasicAuth(request.headers.get("authorization"), credentials.user, credentials.password)) {
    return null;
  }
  return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", "WWW-Authenticate": BASIC_AUTH_CHALLENGE }
  });
}
