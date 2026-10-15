import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { UUID_PATTERN } from "../../mcp/athleteId";

/**
 * The token in a connection link (INI-69): which athlete, and until when. Stateless, signed with
 * HMAC-SHA256, so no table holds pending links. The same token travels in the OAuth `state`, so
 * the callback knows which athlete connected and that the flow started from a link we issued
 * (and, with the browser nonce below, from this browser).
 *
 * Format: `<base64url payload>.<base64url signature>`, payload `{"a":athleteId,"e":expiry seconds}`.
 * Signed with a key derived from the OAuth client secret, so it needs no secret of its own; a
 * rotated secret only invalidates the links in flight.
 */

/** How long a link stays valid. Long enough to open it the next day, short enough to not linger. */
export const CONNECT_LINK_TTL_SECONDS = 72 * 60 * 60;

export type VerifiedLink =
  | { status: "valid"; athleteId: string; expiresAt: Date }
  | { status: "expired" }
  | { status: "invalid" };

function signingKey(clientSecret: string): Buffer {
  return createHmac("sha256", clientSecret).update("inigo:intervals-connect-link:v1").digest();
}

function sign(payload: string, clientSecret: string): string {
  return createHmac("sha256", signingKey(clientSecret)).update(payload).digest("base64url");
}

/** Sign a link token for this athlete, valid `CONNECT_LINK_TTL_SECONDS` from `now`. */
export function signConnectLinkToken(athleteId: string, clientSecret: string, now: Date): { token: string; expiresAt: Date } {
  const expiry = Math.floor(now.getTime() / 1000) + CONNECT_LINK_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ a: athleteId, e: expiry })).toString("base64url");
  return { token: `${payload}.${sign(payload, clientSecret)}`, expiresAt: new Date(expiry * 1000) };
}

/** Check a token's signature, shape and expiry. Never throws. */
export function verifyConnectLinkToken(token: string | undefined, clientSecret: string, now: Date): VerifiedLink {
  if (!token) return { status: "invalid" };
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return { status: "invalid" };

  const expected = Buffer.from(sign(payload, clientSecret));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return { status: "invalid" };

  const claims = readClaims(payload);
  if (!claims) return { status: "invalid" };
  if (claims.e * 1000 <= now.getTime()) return { status: "expired" };
  return { status: "valid", athleteId: claims.a, expiresAt: new Date(claims.e * 1000) };
}

/**
 * The OAuth `state` binds the link token to the browser that started the flow: `<token>~<nonce>`,
 * the nonce also set in an HttpOnly cookie by `/connect/intervals/start`. The callback requires
 * both to match, so a raw authorize URL carrying someone else's token, opened in another browser,
 * never connects an account (OAuth login CSRF).
 */
export const BROWSER_NONCE_COOKIE = "inigo_intervals_connect";

/** How long the browser binding lives: the time to log in on Intervals.icu and grant access. */
export const BROWSER_NONCE_TTL_SECONDS = 15 * 60;

export function newBrowserNonce(): string {
  return randomBytes(18).toString("base64url");
}

export function bindState(token: string, nonce: string): string {
  return `${token}~${nonce}`;
}

export function readState(state: string | undefined): { token: string; nonce: string } | null {
  const [token, nonce, extra] = (state ?? "").split("~");
  if (!token || !nonce || extra !== undefined) return null;
  return { token, nonce };
}

/** Constant time comparison of the state's nonce with the cookie's. */
export function sameNonce(fromState: string, fromCookie: string | undefined): boolean {
  if (!fromCookie) return false;
  const a = Buffer.from(fromState);
  const b = Buffer.from(fromCookie);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readClaims(payload: string): { a: string; e: number } | null {
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims !== "object" || claims === null) return null;
    const { a, e } = claims as Record<string, unknown>;
    if (typeof a !== "string" || !UUID_PATTERN.test(a) || typeof e !== "number") return null;
    return { a, e };
  } catch {
    return null;
  }
}
