import { createHmac, timingSafeEqual } from "node:crypto";

/** HTTP header carrying the OpenWA webhook signature (lower-cased for header lookups). */
export const OPENWA_SIGNATURE_HEADER = "x-openwa-signature";

/**
 * Verify an OpenWA webhook signature.
 *
 * OpenWA signs each delivery with HMAC-SHA256 over the **raw** request body
 * bytes, sending the result in the `X-OpenWA-Signature` header formatted as
 * `sha256=<hexdigest>`. The comparison is constant-time and never throws on
 * malformed input.
 *
 * IMPORTANT: pass the exact raw body string read from the request — never a
 * re-serialized JSON object, or the digest will not match.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) return false;
  return timingSafeEqual(provided, expectedBuffer);
}

/**
 * Constant-time comparison of a presented bearer token against the expected secret.
 * Used to authenticate the brain on the athlete-data MCP endpoint. Returns false on
 * a length mismatch without leaking timing information.
 */
export function verifyBearerToken(provided: string, expected: string): boolean {
  const presented = Buffer.from(provided);
  const secret = Buffer.from(expected);
  if (presented.length !== secret.length) return false;
  return timingSafeEqual(presented, secret);
}

/** Challenge sent with a 401 so the browser prompts for the admin credentials. */
export const BASIC_AUTH_CHALLENGE = 'Basic realm="Inigo admin", charset="UTF-8"';

/**
 * Verify an HTTP Basic `Authorization` header against the expected admin credentials.
 *
 * Guards the admin surface (the `/admin` pages and `/api/admin/*`). Both halves are
 * compared in constant time, and the user is compared even when the password already
 * failed, so neither field leaks through timing. Never throws: a missing, malformed,
 * or non-Basic header is simply false.
 */
export function verifyBasicAuth(
  header: string | null | undefined,
  expectedUser: string,
  expectedPassword: string
): boolean {
  if (!header) return false;
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return false;
  }

  // Only the first colon separates the two: a password may legitimately contain one.
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;
  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  const userOk = verifyBearerToken(user, expectedUser);
  const passwordOk = verifyBearerToken(password, expectedPassword);
  return userOk && passwordOk;
}
