import { describe, expect, it } from "vitest";
import { CONNECT_LINK_TTL_SECONDS, signConnectLinkToken, verifyConnectLinkToken } from "./connectLinkToken";

const SECRET = "client-secret-0123456789";
const ATHLETE = "550e8400-e29b-41d4-a716-446655440000";
const NOW = new Date("2026-10-15T10:00:00Z");

describe("connect link token", () => {
  it("verifies a token it signed, for the athlete it names, until its expiry", () => {
    const { token, expiresAt } = signConnectLinkToken(ATHLETE, SECRET, NOW);
    expect(expiresAt.getTime() - NOW.getTime()).toBe(CONNECT_LINK_TTL_SECONDS * 1000);
    expect(verifyConnectLinkToken(token, SECRET, NOW)).toEqual({ status: "valid", athleteId: ATHLETE, expiresAt });
  });

  it("refuses an expired token", () => {
    const { token, expiresAt } = signConnectLinkToken(ATHLETE, SECRET, NOW);
    expect(verifyConnectLinkToken(token, SECRET, expiresAt)).toEqual({ status: "expired" });
  });

  it("refuses a token signed with another secret", () => {
    const { token } = signConnectLinkToken(ATHLETE, "another-secret-0123456789", NOW);
    expect(verifyConnectLinkToken(token, SECRET, NOW)).toEqual({ status: "invalid" });
  });

  it("refuses a payload swapped for another athlete's", () => {
    const { token } = signConnectLinkToken(ATHLETE, SECRET, NOW);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ a: "11111111-1111-4111-8111-111111111111", e: 9_999_999_999 })).toString("base64url");
    expect(verifyConnectLinkToken(`${forged}.${signature}`, SECRET, NOW)).toEqual({ status: "invalid" });
  });

  it.each([undefined, "", "abc", "a.b.c", "....", "x.y"])("refuses a malformed token %j", (token) => {
    expect(verifyConnectLinkToken(token, SECRET, NOW)).toEqual({ status: "invalid" });
  });
});
