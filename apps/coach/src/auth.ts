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
