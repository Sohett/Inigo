import { describe, expect, it } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { SignInState } from "../domain/signedIn";
import { athleteEmail } from "./athleteEmail";
import { createInigoAuth, type InigoAuth } from "./betterAuth";
import { magicLinkIssuer, whoIsSignedIn } from "./sessions";

const ATHLETE = { id: "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f", displayName: "Thomas" };
const NOW = new Date("2026-10-15T10:00:00Z");

function makeAuth() {
  return createInigoAuth({
    env: {
      secret: "a-test-secret-that-is-long-enough-123456",
      baseUrl: "http://localhost:3000",
      googleClientId: "google-client",
      googleClientSecret: "google-secret"
    },
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    isStaffMember: async (email) => email === "coach@example.com"
  });
}

async function cookieOf(response: Response): Promise<Headers> {
  return new Headers({ cookie: response.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ") });
}

describe("magicLinkIssuer", () => {
  it("is null when sign in is not configured", () => {
    expect(magicLinkIssuer(null)).toBeNull();
  });

  it("makes a link that signs the athlete in and lands on the page, also on error, valid one hour", async () => {
    const auth = makeAuth();
    const { url, expiresAt } = await magicLinkIssuer(auth, () => NOW)!.issue(ATHLETE, "/connect/intervals");

    const params = new URL(url).searchParams;
    expect(params.get("callbackURL")).toBe("/connect/intervals");
    expect(params.get("errorCallbackURL")).toBe("/connect/intervals");
    expect(expiresAt.toISOString()).toBe("2026-10-15T11:00:00.000Z");

    const signedIn = await whoIsSignedIn(await cookieOf(await auth.handler(new Request(url))), auth);
    expect(signedIn).toEqual({ state: SignInState.Athlete, athleteId: ATHLETE.id });
  });
});

describe("magicLinkIssuer, the athlete's user", () => {
  it("is created once, with the athlete id, on the first link only", async () => {
    const auth = makeAuth();
    const issuer = magicLinkIssuer(auth, () => NOW)!;
    await issuer.issue(ATHLETE, "/connect/intervals");
    await issuer.issue(ATHLETE, "/connect/intervals");

    const context = await auth.$context;
    const users = await context.adapter.findMany<{ email: string; role: string; athleteId: string | null }>({ model: "user" });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: athleteEmail(ATHLETE.id), role: "athlete", athleteId: ATHLETE.id });
  });
});

describe("whoIsSignedIn", () => {
  it("reads unavailable when sign in is not configured", async () => {
    expect(await whoIsSignedIn(new Headers(), null)).toEqual({ state: SignInState.Unavailable });
  });

  it("reads signed out without a session cookie, or with a forged one", async () => {
    const auth = makeAuth();
    expect(await whoIsSignedIn(new Headers(), auth)).toEqual({ state: SignInState.SignedOut });
    expect(await whoIsSignedIn(new Headers({ cookie: "better-auth.session_token=forged" }), auth)).toEqual({
      state: SignInState.SignedOut
    });
  });

  /** An auth whose session belongs to this user: the mapping is ours, the session Better Auth's. */
  const authWith = (user: { email: string; name: string; role: string; athleteId?: string | null }) =>
    ({ api: { getSession: async () => ({ user, session: {} }) } }) as unknown as InigoAuth;

  it("reads a staff session as staff", async () => {
    const auth = authWith({ email: "staff@example.com", name: "Thomas", role: "staff", athleteId: null });
    expect(await whoIsSignedIn(new Headers(), auth)).toEqual({ state: SignInState.Staff, email: "staff@example.com", name: "Thomas" });
  });

  it("reads the athlete from the foreign key, not from the email", async () => {
    const auth = authWith({ email: athleteEmail("11111111-1111-4111-8111-111111111111"), name: "", role: "athlete", athleteId: ATHLETE.id });
    expect(await whoIsSignedIn(new Headers(), auth)).toEqual({ state: SignInState.Athlete, athleteId: ATHLETE.id });
  });

  it("reads an athlete user without an athlete as signed out", async () => {
    const auth = authWith({ email: athleteEmail(ATHLETE.id), name: "", role: "athlete", athleteId: null });
    expect(await whoIsSignedIn(new Headers(), auth)).toEqual({ state: SignInState.SignedOut });
  });

  it("reads an unknown role as signed out", async () => {
    const auth = authWith({ email: athleteEmail(ATHLETE.id), name: "", role: "admin" });
    expect(await whoIsSignedIn(new Headers(), auth)).toEqual({ state: SignInState.SignedOut });
  });
});
