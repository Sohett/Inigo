import { createHmac } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";
import { UUID_PATTERN } from "../../mcp/athleteId";

/**
 * The token in a connection link (INI-69): which athlete, and until when. A JWT (HS256, `jose`),
 * so no table holds pending links. The same token travels in the OAuth `state`, so the callback
 * knows which athlete connected and that the flow started from a link we issued.
 *
 * Signed with a key derived from the OAuth client secret, so it needs no secret of its own; a
 * rotated secret only invalidates the links in flight.
 */

/** How long a link stays valid. Long enough to open it the next day, short enough to not linger. */
export const CONNECT_LINK_TTL_SECONDS = 72 * 60 * 60;

/** The `aud` claim: a token signed for anything else with the same key never opens this flow. */
const AUDIENCE = "inigo:intervals-connect";

export type VerifiedLink =
  | { status: "valid"; athleteId: string; expiresAt: Date }
  | { status: "expired" }
  | { status: "invalid" };

function signingKey(clientSecret: string): Uint8Array {
  return new Uint8Array(createHmac("sha256", clientSecret).update("inigo:intervals-connect-link:v1").digest());
}

/** Sign a link token for this athlete, valid `CONNECT_LINK_TTL_SECONDS` from `now`. */
export async function signConnectLinkToken(
  athleteId: string,
  clientSecret: string,
  now: Date
): Promise<{ token: string; expiresAt: Date }> {
  const expiry = Math.floor(now.getTime() / 1000) + CONNECT_LINK_TTL_SECONDS;
  const token = await new SignJWT()
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(athleteId)
    .setAudience(AUDIENCE)
    .setExpirationTime(expiry)
    .sign(signingKey(clientSecret));
  return { token, expiresAt: new Date(expiry * 1000) };
}

/** Check a token's signature (HS256 only), audience, subject and expiry. Never throws. */
export async function verifyConnectLinkToken(token: string | undefined, clientSecret: string, now: Date): Promise<VerifiedLink> {
  if (!token) return { status: "invalid" };
  try {
    const { payload } = await jwtVerify(token, signingKey(clientSecret), {
      algorithms: ["HS256"],
      audience: AUDIENCE,
      requiredClaims: ["sub", "exp"],
      currentDate: now
    });
    if (!payload.sub || !UUID_PATTERN.test(payload.sub) || payload.exp === undefined) return { status: "invalid" };
    return { status: "valid", athleteId: payload.sub, expiresAt: new Date(payload.exp * 1000) };
  } catch (error) {
    return error instanceof errors.JWTExpired ? { status: "expired" } : { status: "invalid" };
  }
}
