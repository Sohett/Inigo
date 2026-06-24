import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of a presented bearer token against the expected
 * secret. Returns false on length mismatch without leaking timing information.
 */
export function verifyBearerToken(provided: string, expected: string): boolean {
  const presented = Buffer.from(provided);
  const secret = Buffer.from(expected);
  if (presented.length !== secret.length) return false;
  return timingSafeEqual(presented, secret);
}
