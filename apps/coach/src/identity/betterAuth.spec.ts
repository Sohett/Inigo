import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { athleteEmail } from "./athleteEmail";
import { createInigoAuth, MAGIC_LINK_TTL_SECONDS } from "./betterAuth";
import { captureMagicLink } from "./magicLinkCapture";

const BASE_URL = "http://localhost:3000";
const ATHLETE_ID = "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f";
const INVITED = "staff@example.com";
const GOOGLE = { method: "oauth", oauth: { providerId: "google" } };

function makeAuth() {
  return createInigoAuth({
    env: {
      secret: "a-test-secret-that-is-long-enough-123456",
      baseUrl: BASE_URL,
      googleClientId: "google-client",
      googleClientSecret: "google-secret"
    },
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    isStaffMember: async (email) => email === INVITED
  });
}

type Auth = ReturnType<typeof makeAuth>;

/** The athlete's user, as our code creates it before their first link (`./sessions`). */
async function createAthleteUser(auth: Auth) {
  const context = await auth.$context;
  return context.internalAdapter.createUser(
    { email: athleteEmail(ATHLETE_ID), name: "Thomas", emailVerified: true, athleteId: ATHLETE_ID },
    { method: "magic-link" }
  );
}

function issueLink(auth: Auth, email = athleteEmail(ATHLETE_ID)): Promise<string> {
  return captureMagicLink(() =>
    auth.api.signInMagicLink({
      body: { email, callbackURL: "/connect/intervals", errorCallbackURL: "/connect/intervals" },
      headers: new Headers()
    })
  );
}

/** Open a link as the browser would: a GET on the verify endpoint. */
function open(auth: Auth, url: string): Promise<Response> {
  return auth.handler(new Request(url));
}

function sessionCookie(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0] ?? "")
    .join("; ");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("magic links (athletes)", () => {
  async function athleteAuth() {
    const auth = makeAuth();
    await createAthleteUser(auth);
    return auth;
  }

  it("captures the link instead of sending it, pointing at the verify endpoint with its destination", async () => {
    const url = new URL(await issueLink(await athleteAuth()));
    expect(url.origin + url.pathname).toBe(`${BASE_URL}/api/auth/magic-link/verify`);
    expect(url.searchParams.get("callbackURL")).toBe("/connect/intervals");
    expect(url.searchParams.get("token")).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it("opens a session for the athlete's user and lands on the destination", async () => {
    const auth = await athleteAuth();
    const response = await open(auth, await issueLink(auth));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${BASE_URL}/connect/intervals`);

    const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie(response) }) });
    expect(session?.user.role).toBe("athlete");
    expect(session?.user.athleteId).toBe(ATHLETE_ID);
  });

  it("is single use: a second click lands on the error destination", async () => {
    const auth = await athleteAuth();
    const url = await issueLink(auth);
    await open(auth, url);
    const again = await open(auth, url);
    expect(again.headers.get("location")).toBe(`${BASE_URL}/connect/intervals?error=INVALID_TOKEN`);
  });

  it("expires after an hour, as the same error", async () => {
    const auth = await athleteAuth();
    const url = await issueLink(auth);
    vi.useFakeTimers({ now: Date.now() + (MAGIC_LINK_TTL_SECONDS + 60) * 1000, toFake: ["Date"] });
    const late = await open(auth, url);
    expect(late.headers.get("location")).toBe(`${BASE_URL}/connect/intervals?error=INVALID_TOKEN`);
  });

  it("can never be requested over HTTP: the endpoint is disabled", async () => {
    const auth = await athleteAuth();
    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL },
        body: JSON.stringify({ email: athleteEmail(ATHLETE_ID) })
      })
    );
    expect(response.status).toBe(404);
  });

  it("refuses to make a link outside a capture, so nothing but our code can issue one", async () => {
    const auth = await athleteAuth();
    await expect(auth.api.signInMagicLink({ body: { email: athleteEmail(ATHLETE_ID) }, headers: new Headers() })).rejects.toThrow();
  });

  it("refuses to make a link for a staff member, who signs in with Google only", async () => {
    const auth = makeAuth();
    const context = await auth.$context;
    await context.internalAdapter.createUser({ email: INVITED, name: "Staff", emailVerified: true }, GOOGLE);
    await expect(issueLink(auth, INVITED)).rejects.toThrow();
  });

  it("refuses to make a link for an email no user has: a link never creates a user", async () => {
    await expect(issueLink(makeAuth())).rejects.toThrow();
  });
});

describe("user creation (roles)", () => {
  it("makes a user created with an athlete id an athlete", async () => {
    const user = await createAthleteUser(makeAuth());
    expect(user.role).toBe("athlete");
    expect(user.athleteId).toBe(ATHLETE_ID);
  });

  it("makes a staff member's Google account staff, tied to no athlete", async () => {
    const context = await makeAuth().$context;
    const user = await context.internalAdapter.createUser({ email: INVITED, name: "Staff", emailVerified: true }, GOOGLE);
    expect(user.role).toBe("staff");
    expect(user.athleteId).toBeNull();
  });

  it("refuses a Google account that was not invited", async () => {
    const context = await makeAuth().$context;
    await expect(
      context.internalAdapter.createUser({ email: "stranger@example.com", name: "X", emailVerified: true }, GOOGLE)
    ).rejects.toThrow(/not been invited/);
  });

  it("never takes the role from what is passed, only from the athlete id", async () => {
    const context = await makeAuth().$context;
    const user = await context.internalAdapter.createUser(
      { email: INVITED, name: "Staff", emailVerified: true, role: "athlete" },
      GOOGLE
    );
    expect(user.role).toBe("staff");
    expect(user.athleteId).toBeNull();
  });
});
