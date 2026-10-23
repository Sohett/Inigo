import { describe, expect, it } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { betterAuthAthleteAccounts } from "./accounts";
import { createInigoAuth } from "./betterAuth";
import { magicLinkIssuer } from "./magicLinks";

const ATHLETE = { id: "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f", displayName: "Thomas" };
const NOW = new Date("2026-10-15T10:00:00Z");

describe("magicLinkIssuer", () => {
  it("is null when sign in is not configured", () => {
    expect(magicLinkIssuer(null)).toBeNull();
  });

  it("lands on the page, also on error, and is valid one hour", async () => {
    const auth = createInigoAuth({
      env: {
        secret: "a-test-secret-that-is-long-enough-123456",
        baseUrl: "http://localhost:3000",
        googleClientId: "google-client",
        googleClientSecret: "google-secret"
      },
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] })
    });
    await betterAuthAthleteAccounts(auth).ensure(ATHLETE);

    const { url, expiresAt } = await magicLinkIssuer(auth, () => NOW)!.issue(ATHLETE.id, "/connect/intervals");
    const params = new URL(url).searchParams;
    expect(params.get("callbackURL")).toBe("/connect/intervals");
    expect(params.get("errorCallbackURL")).toBe("/connect/intervals");
    expect(expiresAt.toISOString()).toBe("2026-10-15T11:00:00.000Z");
  });
});
