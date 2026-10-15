import { describe, expect, it } from "vitest";
import {
  bindState,
  CONNECT_LINK_TTL_SECONDS,
  newBrowserNonce,
  readState,
  sameNonce,
  signConnectLinkToken,
  verifyConnectLinkToken
} from "./connectLinkToken";

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

describe("OAuth state", () => {
  it("binds a token to a browser nonce and reads both back", () => {
    expect(readState(bindState("payload.sig", "nonce"))).toEqual({ token: "payload.sig", nonce: "nonce" });
  });

  it.each([undefined, "", "payload.sig", "a~", "~b", "a~b~c"])("refuses a state without exactly one binding: %j", (state) => {
    expect(readState(state)).toBeNull();
  });

  it("matches a nonce only against the same cookie value", () => {
    const nonce = newBrowserNonce();
    expect(sameNonce(nonce, nonce)).toBe(true);
    expect(sameNonce(nonce, newBrowserNonce())).toBe(false);
    expect(sameNonce(nonce, undefined)).toBe(false);
    expect(sameNonce(nonce, `${nonce}x`)).toBe(false);
  });
});
