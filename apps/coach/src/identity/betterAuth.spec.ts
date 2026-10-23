import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { memoryAdapter } from "better-auth/adapters/memory";
import { StaffRole, StaffStatus } from "../domain/staff";
import { SignInState } from "../domain/signedIn";
import { betterAuthAthleteAccounts, betterAuthStaff } from "./accounts";
import { athleteEmail } from "./athleteEmail";
import { createInigoAuth, MAGIC_LINK_TTL_SECONDS } from "./betterAuth";
import { magicLinkIssuer } from "./magicLinks";
import { whoIsSignedIn } from "./sessions";

/**
 * Better Auth as the coach runs it (INI-87), through its **real entry points**: the HTTP handler
 * for Google's sign in and callback (Google's token endpoint answered by msw) and for magic links,
 * and the admin plugin's API for users. A user is never created by signing in: our adapters
 * (`./accounts`) create them, as the use-cases do.
 */

const BASE_URL = "http://localhost:3000";
const ATHLETE = { id: "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f", displayName: "Thomas" };
const THOMAS = "sohet.thomas@gmail.com";
const THOMAS_GOOGLE = { sub: "google-thomas", email: THOMAS, name: "Thomas Sohet" };

interface GoogleAccount {
  sub: string;
  email: string;
  name: string;
  /** Whether Google vouches for the email; true unless a test says otherwise. */
  emailVerified?: boolean;
}

/** The Google account the next callback signs in with. */
let googleAccount: GoogleAccount = THOMAS_GOOGLE;

function unsignedJwt({ emailVerified = true, ...claims }: GoogleAccount & { aud: string }): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part({ ...claims, email_verified: emailVerified, iss: "https://accounts.google.com" })}.`;
}

const server = setupServer(
  http.post("https://oauth2.googleapis.com/token", () =>
    HttpResponse.json({
      access_token: "google-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid email profile",
      id_token: unsignedJwt({ ...googleAccount, aud: "google-client" })
    })
  )
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

function makeAuth() {
  return createInigoAuth({
    env: {
      secret: "a-test-secret-that-is-long-enough-123456",
      baseUrl: BASE_URL,
      googleClientId: "google-client",
      googleClientSecret: "google-secret"
    },
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] })
  });
}
type Auth = ReturnType<typeof makeAuth>;

function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0] ?? "")
    .join("; ");
}

/** The whole Google sign in, as the browser does it: start, then come back from Google. */
async function signInWithGoogle(auth: Auth, account: GoogleAccount = THOMAS_GOOGLE): Promise<Response> {
  googleAccount = account;
  const start = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL },
      body: JSON.stringify({ provider: "google", callbackURL: "/admin", errorCallbackURL: "/login" })
    })
  );
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/callback/google?code=google-code&state=${encodeURIComponent(state)}`, {
      headers: { cookie: cookiesOf(start) }
    })
  );
}

/** The first staff member, as the migration makes them: a user with roles, not yet signed in. */
async function inviteThomas(auth: Auth) {
  await auth.api.createUser({ body: { email: THOMAS, name: "", role: [StaffRole.Admin, StaffRole.Coach] } });
}

async function users(auth: Auth) {
  return (await auth.$context).adapter.findMany<{ email: string; role: string; athleteId?: string | null; emailVerified: boolean }>({
    model: "user"
  });
}

describe("staff: Google signs in an invited user, never creates one", () => {
  it("links Thomas's Google account to his user and opens a staff session", async () => {
    const auth = makeAuth();
    await inviteThomas(auth);

    const callback = await signInWithGoogle(auth);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/admin");

    const signedIn = await whoIsSignedIn(new Headers({ cookie: cookiesOf(callback) }), auth);
    expect(signedIn).toMatchObject({ state: SignInState.Staff, email: THOMAS });
    expect(await users(auth)).toMatchObject([{ email: THOMAS, role: "admin,coach", emailVerified: true }]);
  });

  it("refuses a Google account nobody invited, creating no user", async () => {
    const auth = makeAuth();
    const callback = await signInWithGoogle(auth, { sub: "google-stranger", email: "stranger@example.com", name: "X" });

    expect(callback.headers.get("location")).toContain("/login?error=signup_disabled");
    expect(await users(auth)).toEqual([]);
  });

  it("lists the team as invited, then active once signed in, and removes a member with their sessions", async () => {
    const auth = makeAuth();
    await inviteThomas(auth);
    const thomas = new Headers({ cookie: cookiesOf(await signInWithGoogle(auth)) });
    const team = betterAuthStaff(auth, thomas);
    const coachGoogle = { sub: "google-coach", email: "new.coach@example.com", name: "Coach" };

    expect(await team.create({ email: "new.coach@example.com", roles: [StaffRole.Coach], invitedBy: THOMAS })).toBe(true);
    expect(await team.create({ email: "new.coach@example.com", roles: [StaffRole.Admin], invitedBy: THOMAS })).toBe(false);
    expect(await team.list()).toMatchObject([
      { email: THOMAS, roles: ["admin", "coach"], status: StaffStatus.Active, name: "Thomas Sohet" },
      { email: "new.coach@example.com", roles: ["coach"], status: StaffStatus.Invited, invitedBy: THOMAS, name: null }
    ]);

    const coach = new Headers({ cookie: cookiesOf(await signInWithGoogle(auth, coachGoogle)) });
    expect((await whoIsSignedIn(coach, auth)).state).toBe(SignInState.Staff);
    expect((await team.list())[1]).toMatchObject({ status: StaffStatus.Active, name: "Coach" });

    expect(await team.remove("new.coach@example.com")).toBe(true);
    expect((await whoIsSignedIn(coach, auth)).state).toBe(SignInState.SignedOut);
    expect((await signInWithGoogle(auth, coachGoogle)).headers.get("location")).toContain("error=signup_disabled");
    expect(await team.remove("new.coach@example.com")).toBe(false);
  });

  it("refuses a Google account whose email Google does not vouch for, even if invited", async () => {
    const auth = makeAuth();
    await inviteThomas(auth);
    const callback = await signInWithGoogle(auth, { ...THOMAS_GOOGLE, emailVerified: false });
    expect(callback.headers.get("location")).toContain("error=");
    expect(await users(auth)).toMatchObject([{ email: THOMAS, emailVerified: false }]);
  });

  it("never lists an athlete in the team, nor removes one as a member", async () => {
    const auth = makeAuth();
    await inviteThomas(auth);
    await betterAuthAthleteAccounts(auth).ensure(ATHLETE);
    const team = betterAuthStaff(auth, new Headers({ cookie: cookiesOf(await signInWithGoogle(auth)) }));

    expect((await team.list()).map((member) => member.email)).toEqual([THOMAS]);
    expect(await team.remove(athleteEmail(ATHLETE.id))).toBe(false);
    expect(await users(auth)).toHaveLength(2);
  });
});

describe("athletes: a magic link signs in the user createAthleteLink made", () => {
  async function athleteLink(auth: Auth) {
    await betterAuthAthleteAccounts(auth).ensure(ATHLETE);
    return (await magicLinkIssuer(auth)!.issue(ATHLETE.id, "/connect/intervals")).url;
  }

  it("creates the athlete's user once, then signs them in and lands on the page", async () => {
    const auth = makeAuth();
    const url = await athleteLink(auth);
    await betterAuthAthleteAccounts(auth).ensure(ATHLETE);
    expect(await users(auth)).toMatchObject([{ email: athleteEmail(ATHLETE.id), role: "athlete", athleteId: ATHLETE.id }]);

    const response = await auth.handler(new Request(url));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${BASE_URL}/connect/intervals`);
    expect(await whoIsSignedIn(new Headers({ cookie: cookiesOf(response) }), auth)).toEqual({
      state: SignInState.Athlete,
      athleteId: ATHLETE.id
    });
  });

  it("is single use, and expires after an hour, both as the same error", async () => {
    const auth = makeAuth();
    const used = await athleteLink(auth);
    await auth.handler(new Request(used));
    expect((await auth.handler(new Request(used))).headers.get("location")).toBe(`${BASE_URL}/connect/intervals?error=INVALID_TOKEN`);

    const late = (await magicLinkIssuer(auth)!.issue(ATHLETE.id, "/connect/intervals")).url;
    vi.useFakeTimers({ now: Date.now() + (MAGIC_LINK_TTL_SECONDS + 60) * 1000, toFake: ["Date"] });
    expect((await auth.handler(new Request(late))).headers.get("location")).toBe(`${BASE_URL}/connect/intervals?error=INVALID_TOKEN`);
  });

  it("signs in nobody for an athlete without a user: a link never creates one", async () => {
    const auth = makeAuth();
    const url = (await magicLinkIssuer(auth)!.issue(ATHLETE.id, "/connect/intervals")).url;
    const response = await auth.handler(new Request(url));
    expect(response.headers.get("location")).toContain("/connect/intervals?error=");
    expect(await users(auth)).toEqual([]);
  });

  it("gives an athlete's session no power over the team", async () => {
    const auth = makeAuth();
    const athlete = new Headers({ cookie: cookiesOf(await auth.handler(new Request(await athleteLink(auth)))) });
    const team = betterAuthStaff(auth, athlete);
    await expect(team.create({ email: "x@example.com", roles: [StaffRole.Admin], invitedBy: "x" })).rejects.toThrow();
    expect(await users(auth)).toHaveLength(1);
  });
});

describe("never over HTTP", () => {
  it.each(["/sign-in/magic-link", "/admin/create-user", "/admin/list-users", "/admin/remove-user", "/admin/impersonate-user"])(
    "answers 404 on %s",
    async (path) => {
      const response = await makeAuth().handler(
        new Request(`${BASE_URL}/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE_URL },
          body: JSON.stringify({ email: "x@example.com" })
        })
      );
      expect(response.status).toBe(404);
    }
  );

  it("refuses to make a magic link outside the use-case's capture", async () => {
    const auth = makeAuth();
    await betterAuthAthleteAccounts(auth).ensure(ATHLETE);
    await expect(auth.api.signInMagicLink({ body: { email: athleteEmail(ATHLETE.id) }, headers: new Headers() })).rejects.toThrow();
  });
});
