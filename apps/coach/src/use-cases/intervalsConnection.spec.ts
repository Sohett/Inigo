import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import { ConnectionResult } from "../domain/intervalsConnection";
import { signConnectLinkToken } from "../intervals/oauth/connectLinkToken";
import type { IntervalsOAuthConfig } from "../intervals/oauth/credentials";
import type { CallbackOutcome, ConnectionFlow, IntervalsOAuth } from "../intervals/oauth/intervalsOAuth";
import { AssessStatus, type AssessOnboardingOutcome } from "./assessOnboarding";
import { AgentNotice, createCompleteIntervalsConnection, type ConnectionCallback } from "./completeIntervalsConnection";
import { createCreateIntervalsConnectLink } from "./createIntervalsConnectLink";
import { createStartIntervalsConnection } from "./startIntervalsConnection";

const NOW = new Date("2026-10-15T10:00:00Z");
const CONFIG: IntervalsOAuthConfig = {
  clientId: "inigo",
  clientSecret: "client-secret-0123456789",
  publicUrl: "https://app.inigo-coach.com"
};
const ATHLETE: Athlete = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  displayName: "Thomas",
  phoneNum: "+32470000001",
  whatsappLid: null,
  chatId: "32470000001@c.us",
  status: "onboarding",
  timezone: "Europe/Brussels",
  locale: "fr",
  activeSession: { sessionId: "sesn_onboarding", agentId: "agent_onboarding" }
};
const ALL_SCOPES = ["ACTIVITY:READ", "WELLNESS:WRITE", "CALENDAR:WRITE", "SETTINGS:WRITE"];
const EXCHANGED: CallbackOutcome = {
  status: "exchanged",
  token: { accessToken: "token-123", scopes: ALL_SCOPES, intervalsAthleteId: "i42", athleteName: "Thomas" }
};

/** The link token, as in the link sent on WhatsApp. */
const link = async (now = NOW) => (await signConnectLinkToken(ATHLETE.id, CONFIG.clientSecret, now)).token;
/** The flow this browser keeps in its cookie: the link in the `state`, and a PKCE verifier. */
const flowFor = async (now = NOW): Promise<ConnectionFlow> => ({ state: `${await link(now)}~random`, codeVerifier: "verifier" });
const CALLBACK = new URLSearchParams("code=code-1&state=whatever");

/** An OAuth client whose `complete` answers `outcome`; `begin` echoes the link it was given. */
function fakeOAuth(outcome: CallbackOutcome = EXCHANGED) {
  const client = {
    begin: vi.fn(async (linkToken: string) => ({
      authorizeUrl: `https://intervals.icu/oauth/authorize?state=${linkToken}~random`,
      flow: { state: `${linkToken}~random`, codeVerifier: "verifier" }
    })),
    complete: vi.fn(async () => outcome)
  };
  return { config: CONFIG, client } satisfies IntervalsOAuth;
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("createIntervalsConnectLink", () => {
  const findById = vi.fn(async (id: string) => (id === ATHLETE.id ? ATHLETE : null));

  it("gives a signed link to our page, valid 72 hours", async () => {
    const useCase = createCreateIntervalsConnectLink({ oauth: CONFIG, repo: { findById }, now: () => NOW });
    const outcome = await useCase.execute(ATHLETE.id);
    const expected = await link();

    expect(outcome).toEqual({ status: "link", url: expect.any(String), expiresAt: "2026-10-18T10:00:00.000Z" });
    const url = new URL(outcome.status === "link" ? outcome.url : "");
    expect(`${url.origin}${url.pathname}`).toBe("https://app.inigo-coach.com/connect/intervals");
    expect(url.searchParams.get("t")).toBe(expected);
  });

  it("says OAuth is unavailable when the app is not configured, so the agent falls back to the key", async () => {
    const outcome = await createCreateIntervalsConnectLink({ oauth: null, repo: { findById } }).execute(ATHLETE.id);
    expect(outcome.status).toBe("oauth_unavailable");
  });

  it("refuses an athlete that does not exist", async () => {
    const useCase = createCreateIntervalsConnectLink({ oauth: CONFIG, repo: { findById } });
    expect((await useCase.execute("11111111-1111-4111-8111-111111111111")).status).toBe("unknown_athlete");
  });
});

describe("startIntervalsConnection", () => {
  const start = (oauth: IntervalsOAuth | null = fakeOAuth(), athlete: Athlete | null = ATHLETE) =>
    createStartIntervalsConnection({ oauth, repo: { findById: vi.fn(async () => athlete) }, now: () => NOW });

  it("says whose account the link connects, and starts a flow for this link", async () => {
    const oauth = fakeOAuth();
    const token = await link();
    const outcome = await start(oauth).execute(token);
    if (outcome.status !== "ready") throw new Error(`expected ready, got ${outcome.status}`);

    expect(outcome.holder).toEqual({ displayName: "Thomas", phoneHint: "01" });
    expect(oauth.client.begin).toHaveBeenCalledWith(token);
    expect(outcome.flow).toEqual({ state: `${token}~random`, codeVerifier: "verifier" });
    expect(outcome.authorizeUrl).toContain(`state=${token}~random`);
  });

  it.each([
    ["an expired link", async () => link(new Date("2026-10-10T10:00:00Z")), ConnectionResult.ExpiredLink],
    ["a forged link", async () => `${await link()}x`, ConnectionResult.InvalidLink],
    ["no link at all", async () => undefined, ConnectionResult.InvalidLink]
  ])("refuses %s, starting no flow", async (_label, token, status) => {
    const oauth = fakeOAuth();
    expect(await start(oauth).execute(await token())).toEqual({ status });
    expect(oauth.client.begin).not.toHaveBeenCalled();
  });

  it.each([
    ["is gone", null],
    ["is blocked", { ...ATHLETE, status: "blocked" as const }]
  ])("refuses a link whose athlete %s", async (_label, athlete) => {
    expect(await start(fakeOAuth(), athlete).execute(await link())).toEqual({ status: ConnectionResult.InvalidLink });
  });

  it("says when OAuth is not configured", async () => {
    expect(await start(null).execute(await link())).toEqual({ status: ConnectionResult.Unavailable });
  });
});

describe("completeIntervalsConnection", () => {
  function setup(
    overrides: { athlete?: Athlete | null; outcome?: CallbackOutcome; assessFails?: boolean; oauth?: null; connectedTo?: string } = {}
  ) {
    const calls: string[] = [];
    const oauth = fakeOAuth(overrides.outcome);
    oauth.client.complete.mockImplementation(async () => {
      calls.push("complete");
      return overrides.outcome ?? EXCHANGED;
    });
    const save = vi.fn(async () => {
      calls.push("save");
    });
    const appendUserMessage = vi.fn(async () => {
      calls.push("append");
    });
    const assess = vi.fn(async (): Promise<AssessOnboardingOutcome> => {
      if (overrides.assessFails) throw new Error("Intervals.icu down");
      return { status: AssessStatus.Assessed, state: { done: ["intervals_connected"], missing: ["body"], complete: false } };
    });
    const useCase = createCompleteIntervalsConnection({
      oauth: overrides.oauth === null ? null : oauth,
      repo: { findById: vi.fn(async () => (overrides.athlete === undefined ? ATHLETE : overrides.athlete)) },
      store: { save },
      connectedAccount: vi.fn(async () => overrides.connectedTo ?? null),
      assessOnboarding: { execute: assess },
      brain: { appendUserMessage },
      now: () => NOW
    });
    return { useCase, oauth, save, appendUserMessage, calls };
  }

  /** The callback as it reaches the route, from the browser that started the flow. */
  const callback = async (flow?: ConnectionFlow | null): Promise<ConnectionCallback> => ({
    query: CALLBACK,
    flow: flow === null ? undefined : (flow ?? (await flowFor()))
  });

  it("checks the callback against this browser's flow, stores the token as an OAuth credential, then wakes the onboarding agent", async () => {
    const { useCase, oauth, save, appendUserMessage, calls } = setup();
    const flow = await flowFor();

    expect(await useCase.execute({ query: CALLBACK, flow })).toEqual({
      result: ConnectionResult.Connected,
      agent: AgentNotice.Notified
    });
    expect(oauth.client.complete).toHaveBeenCalledWith(CALLBACK, flow);
    expect(calls).toEqual(["complete", "save", "append"]);
    expect(save).toHaveBeenCalledWith(ATHLETE.id, { type: "oauth", accessToken: "token-123" }, "i42");
    const [sessionId, turn] = appendUserMessage.mock.calls[0] as unknown as [string, string];
    expect(sessionId).toBe("sesn_onboarding");
    expect(turn).toContain("onboarding_fait: intervals_connected\nonboarding_manquant: body\nevenement: intervals_connecte\nmessage: \"\"");
  });

  it("reconnects the same Intervals.icu account, e.g. from an API key to OAuth", async () => {
    const { useCase, save } = setup({ connectedTo: "i42" });
    expect((await useCase.execute(await callback())).result).toBe(ConnectionResult.Connected);
    expect(save).toHaveBeenCalled();
  });

  it("keeps the connection when the agent cannot be told", async () => {
    const { useCase, save } = setup({ assessFails: true });
    expect(await useCase.execute(await callback())).toEqual({
      result: ConnectionResult.Connected,
      agent: AgentNotice.Failed
    });
    expect(save).toHaveBeenCalled();
  });

  it("does not wake a coordinator: only onboarding knows the event", async () => {
    const { useCase, appendUserMessage } = setup({ athlete: { ...ATHLETE, status: "active" } });
    expect(await useCase.execute(await callback())).toEqual({
      result: ConnectionResult.Connected,
      agent: AgentNotice.NotNeeded
    });
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["the athlete declined", async () => callback(), { outcome: { status: "denied" } }, ConnectionResult.Denied],
    ["Intervals.icu sent another error", async () => callback(), { outcome: { status: "error" } }, ConnectionResult.Failed],
    ["the response is not this browser's flow", async () => callback(), { outcome: { status: "state_mismatch" } }, ConnectionResult.SessionMismatch],
    ["this browser did not start the flow", async () => callback(null), {}, ConnectionResult.SessionMismatch],
    ["the flow's state is forged", async () => callback({ state: "forged.state~random", codeVerifier: "v" }), {}, ConnectionResult.InvalidLink],
    ["the flow's state carries no link", async () => callback({ state: await link(), codeVerifier: "v" }), {}, ConnectionResult.InvalidLink],
    ["the link expired", async () => callback(await flowFor(new Date("2026-10-01T10:00:00Z"))), {}, ConnectionResult.ExpiredLink],
    ["another Intervals.icu account is already connected", async () => callback(), { connectedTo: "i99" }, ConnectionResult.OtherAccount],
    ["the athlete is gone", async () => callback(), { athlete: null }, ConnectionResult.InvalidLink],
    ["the athlete is blocked", async () => callback(), { athlete: { ...ATHLETE, status: "blocked" as const } }, ConnectionResult.InvalidLink],
    ["the code is refused", async () => callback(), { outcome: { status: "rejected", httpStatus: 400 } }, ConnectionResult.Failed],
    [
      "a scope was unticked",
      async () => callback(),
      { outcome: { status: "exchanged", token: { accessToken: "token-123", scopes: ["ACTIVITY:READ", "WELLNESS:READ"], intervalsAthleteId: "i42", athleteName: null } } },
      ConnectionResult.MissingScopes
    ],
    ["OAuth is not configured", async () => callback(), { oauth: null }, ConnectionResult.Unavailable]
  ])("stores nothing when %s", async (_label, makeCallback, overrides, result) => {
    const { useCase, save, appendUserMessage } = setup(overrides as Parameters<typeof setup>[0]);
    expect(await useCase.execute(await makeCallback())).toEqual({ result });
    expect(save).not.toHaveBeenCalled();
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("says denied for a refusal even without the cookie or the state echoed back, storing nothing", async () => {
    const { useCase, oauth, save } = setup();
    const query = new URLSearchParams("error=access_denied");
    expect(await useCase.execute({ query, flow: undefined })).toEqual({ result: ConnectionResult.Denied });
    expect(await useCase.execute({ query, flow: await flowFor() })).toEqual({ result: ConnectionResult.Denied });
    expect(oauth.client.complete).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("never reaches Intervals.icu for a link it cannot trust", async () => {
    const { useCase, oauth } = setup();
    await useCase.execute(await callback({ state: "forged.state~random", codeVerifier: "v" }));
    expect(oauth.client.complete).not.toHaveBeenCalled();
  });

  it("throws on an outage of the exchange, storing nothing", async () => {
    const { useCase, oauth, save } = setup();
    oauth.client.complete.mockRejectedValueOnce(new Error("Intervals.icu token endpoint answered 503."));
    await expect(useCase.execute(await callback())).rejects.toThrow("503");
    expect(save).not.toHaveBeenCalled();
  });
});
