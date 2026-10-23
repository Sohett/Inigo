import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import { ConnectionResult } from "../domain/intervalsConnection";
import { SignInState, type SignedIn } from "../domain/signedIn";
import type { IntervalsOAuthConfig } from "../intervals/oauth/credentials";
import type { CallbackOutcome, ConnectionFlow, IntervalsOAuth } from "../intervals/oauth/intervalsOAuth";
import { AssessStatus, type AssessOnboardingOutcome } from "./assessOnboarding";
import { AgentNotice, createCompleteIntervalsConnection, type ConnectionCallback } from "./completeIntervalsConnection";
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

/** This browser, signed in as the athlete by the magic link they opened (INI-85). */
const SIGNED_IN: SignedIn = { state: SignInState.Athlete, athleteId: ATHLETE.id };
/** The flow this browser keeps in its cookie: a random `state` and a PKCE verifier. */
const FLOW: ConnectionFlow = { state: "random-state", codeVerifier: "verifier" };
const CALLBACK = new URLSearchParams("code=code-1&state=whatever");

/** An OAuth client whose `complete` answers `outcome`, and whose `begin` draws `FLOW`. */
function fakeOAuth(outcome: CallbackOutcome = EXCHANGED) {
  const client = {
    begin: vi.fn(async () => ({ authorizeUrl: `https://intervals.icu/oauth/authorize?state=${FLOW.state}`, flow: FLOW })),
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

describe("startIntervalsConnection", () => {
  const start = (oauth: IntervalsOAuth | null = fakeOAuth(), athlete: Athlete | null = ATHLETE) =>
    createStartIntervalsConnection({ oauth, repo: { findById: vi.fn(async () => athlete) } });

  it("says whose account the page connects, and starts a flow for the signed in athlete", async () => {
    const oauth = fakeOAuth();
    const outcome = await start(oauth).execute({ signedIn: SIGNED_IN, linkFailed: false });
    if (outcome.status !== "ready") throw new Error(`expected ready, got ${outcome.status}`);

    expect(outcome.holder).toEqual({ displayName: "Thomas", phoneHint: "01" });
    expect(oauth.client.begin).toHaveBeenCalled();
    expect(outcome.flow).toEqual(FLOW);
  });

  it("still shows the page on a second click of a used link, from the browser it signed in", async () => {
    const outcome = await start().execute({ signedIn: SIGNED_IN, linkFailed: true });
    expect(outcome.status).toBe("ready");
  });

  it.each([
    ["a link that could not sign in (used or past its hour)", { state: SignInState.SignedOut }, true, ConnectionResult.ExpiredLink],
    ["a visit with no link and no session", { state: SignInState.SignedOut }, false, ConnectionResult.InvalidLink],
    ["a staff member's session", { state: SignInState.Staff, email: "staff@example.com", name: null }, false, ConnectionResult.InvalidLink],
    ["a deployment without sign in", { state: SignInState.Unavailable }, false, ConnectionResult.Unavailable]
  ] as const)("refuses %s, starting no flow", async (_label, signedIn, linkFailed, status) => {
    const oauth = fakeOAuth();
    expect(await start(oauth).execute({ signedIn, linkFailed })).toEqual({ status });
    expect(oauth.client.begin).not.toHaveBeenCalled();
  });

  it.each([
    ["is gone", null],
    ["is blocked", { ...ATHLETE, status: "blocked" as const }]
  ])("refuses an athlete who %s", async (_label, athlete) => {
    expect(await start(fakeOAuth(), athlete).execute({ signedIn: SIGNED_IN, linkFailed: false })).toEqual({
      status: ConnectionResult.InvalidLink
    });
  });

  it("says when OAuth is not configured", async () => {
    expect(await start(null).execute({ signedIn: SIGNED_IN, linkFailed: false })).toEqual({ status: ConnectionResult.Unavailable });
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
  const callback = async (flow?: ConnectionFlow | null, signedIn: SignedIn = SIGNED_IN): Promise<ConnectionCallback> => ({
    query: CALLBACK,
    flow: flow === null ? undefined : (flow ?? FLOW),
    signedIn
  });

  it("checks the callback against this browser's flow, stores the token, then wakes the onboarding agent", async () => {
    const { useCase, oauth, save, appendUserMessage, calls } = setup();
    const flow = FLOW;

    expect(await useCase.execute({ query: CALLBACK, flow, signedIn: SIGNED_IN })).toEqual({
      result: ConnectionResult.Connected,
      agent: AgentNotice.Notified
    });
    expect(oauth.client.complete).toHaveBeenCalledWith(CALLBACK, flow);
    expect(calls).toEqual(["complete", "save", "append"]);
    expect(save).toHaveBeenCalledWith(ATHLETE.id, "token-123", "i42");
    const [sessionId, turn] = appendUserMessage.mock.calls[0] as unknown as [string, string];
    expect(sessionId).toBe("sesn_onboarding");
    expect(turn).toContain("onboarding_fait: intervals_connected\nonboarding_manquant: body\nevenement: intervals_connecte\nmessage: \"\"");
  });

  it("reconnects the same Intervals.icu account, e.g. after a revoked access", async () => {
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

  it.each(["active", "paused"] as const)("wakes the coordinator of a %s athlete who reconnected, with the event alone", async (status) => {
    const { useCase, appendUserMessage } = setup({ athlete: { ...ATHLETE, status } });
    expect(await useCase.execute(await callback())).toEqual({
      result: ConnectionResult.Connected,
      agent: AgentNotice.Notified
    });
    const turn = String((appendUserMessage.mock.calls as unknown[][])[0]?.[1]);
    expect(turn).toContain("evenement: intervals_connecte");
    expect(turn).not.toContain("onboarding_manquant");
    expect(turn.split("\n").at(-1)).toBe('message: ""');
  });

  it.each([
    ["the athlete declined", async () => callback(), { outcome: { status: "denied" } }, ConnectionResult.Denied],
    ["Intervals.icu sent another error", async () => callback(), { outcome: { status: "error" } }, ConnectionResult.Failed],
    ["the response is not this browser's flow", async () => callback(), { outcome: { status: "state_mismatch" } }, ConnectionResult.SessionMismatch],
    ["this browser did not start the flow", async () => callback(null), {}, ConnectionResult.SessionMismatch],
    ["this browser is not signed in", async () => callback(undefined, { state: SignInState.SignedOut }), {}, ConnectionResult.InvalidLink],
    [
      "this browser is a staff member's",
      async () => callback(undefined, { state: SignInState.Staff, email: "staff@example.com", name: null }),
      {},
      ConnectionResult.InvalidLink
    ],
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
    expect(await useCase.execute({ query, flow: undefined, signedIn: SIGNED_IN })).toEqual({ result: ConnectionResult.Denied });
    expect(await useCase.execute({ query, flow: FLOW, signedIn: SIGNED_IN })).toEqual({ result: ConnectionResult.Denied });
    expect(oauth.client.complete).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("never reaches Intervals.icu for a browser no athlete is signed in on", async () => {
    const { useCase, oauth } = setup();
    await useCase.execute(await callback(undefined, { state: SignInState.SignedOut }));
    expect(oauth.client.complete).not.toHaveBeenCalled();
  });

  it("throws on an outage of the exchange, storing nothing", async () => {
    const { useCase, oauth, save } = setup();
    oauth.client.complete.mockRejectedValueOnce(new Error("Intervals.icu token endpoint answered 503."));
    await expect(useCase.execute(await callback())).rejects.toThrow("503");
    expect(save).not.toHaveBeenCalled();
  });
});
