import { createHmac } from "node:crypto";
import { base64url, SignJWT, UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import { CONNECT_LINK_TTL_SECONDS, signConnectLinkToken, verifyConnectLinkToken } from "./connectLinkToken";

const SECRET = "client-secret-0123456789";
const ATHLETE = "550e8400-e29b-41d4-a716-446655440000";
const NOW = new Date("2026-10-15T10:00:00Z");

describe("connect link token", () => {
  it("verifies a token it signed, for the athlete it names, until its expiry", async () => {
    const { token, expiresAt } = await signConnectLinkToken(ATHLETE, SECRET, NOW);
    expect(expiresAt.getTime() - NOW.getTime()).toBe(CONNECT_LINK_TTL_SECONDS * 1000);
    expect(await verifyConnectLinkToken(token, SECRET, NOW)).toEqual({ status: "valid", athleteId: ATHLETE, expiresAt });
  });

  it("refuses an expired token", async () => {
    const { token, expiresAt } = await signConnectLinkToken(ATHLETE, SECRET, NOW);
    expect(await verifyConnectLinkToken(token, SECRET, expiresAt)).toEqual({ status: "expired" });
  });

  it("refuses a token signed with another secret", async () => {
    const { token } = await signConnectLinkToken(ATHLETE, "another-secret-0123456789", NOW);
    expect(await verifyConnectLinkToken(token, SECRET, NOW)).toEqual({ status: "invalid" });
  });

  it("refuses a payload swapped for another athlete's", async () => {
    const { token } = await signConnectLinkToken(ATHLETE, SECRET, NOW);
    const [header, , signature] = token.split(".");
    const forged = base64url.encode(JSON.stringify({ sub: "11111111-1111-4111-8111-111111111111", aud: "inigo:intervals-connect", exp: 9_999_999_999 }));
    expect(await verifyConnectLinkToken(`${header}.${forged}.${signature}`, SECRET, NOW)).toEqual({ status: "invalid" });
  });

  it("refuses an unsigned token (alg none)", async () => {
    const unsigned = new UnsecuredJWT({}).setSubject(ATHLETE).setAudience("inigo:intervals-connect").setExpirationTime("1h").encode();
    expect(await verifyConnectLinkToken(unsigned, SECRET, NOW)).toEqual({ status: "invalid" });
  });

  it("refuses a token signed for another audience with the same key", async () => {
    // The same derivation as the module's signing key.
    const key = new Uint8Array(createHmac("sha256", SECRET).update("inigo:intervals-connect-link:v1").digest());
    const other = await new SignJWT().setProtectedHeader({ alg: "HS256" }).setSubject(ATHLETE).setAudience("other").setExpirationTime("1h").sign(key);
    expect(await verifyConnectLinkToken(other, SECRET, NOW)).toEqual({ status: "invalid" });
  });

  it.each([undefined, "", "abc", "a.b.c", "....", "x.y"])("refuses a malformed token %j", async (token) => {
    expect(await verifyConnectLinkToken(token, SECRET, NOW)).toEqual({ status: "invalid" });
  });
});
