import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import { ConnectionResult } from "../domain/intervalsConnection";
import { signConnectLinkToken } from "../intervals/oauth/connectLinkToken";
import type { IntervalsOAuthConfig } from "../intervals/oauth/credentials";
import type { CodeExchange } from "../intervals/oauth/intervalsOAuth";
import { AssessStatus, type AssessOnboardingOutcome } from "./assessOnboarding";
import { AgentNotice, createCompleteIntervalsConnection } from "./completeIntervalsConnection";
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
const ALL_SCOPES = ["ACTIVITY:READ", "WELLNESS:READ", "CALENDAR:WRITE", "SETTINGS:WRITE"];
const EXCHANGED: CodeExchange = {
  status: "exchanged",
  token: { accessToken: "token-123", scopes: ALL_SCOPES, intervalsAthleteId: "i42", athleteName: "Thomas" }
};

const state = (now = NOW) => signConnectLinkToken(ATHLETE.id, CONFIG.clientSecret, now).token;

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

    expect(outcome).toEqual({ status: "link", url: expect.any(String), expiresAt: "2026-10-18T10:00:00.000Z" });
    const url = new URL(outcome.status === "link" ? outcome.url : "");
    expect(`${url.origin}${url.pathname}`).toBe("https://app.inigo-coach.com/connect/intervals");
    expect(url.searchParams.get("t")).toBe(state());
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
  const start = (oauth: IntervalsOAuthConfig | null = CONFIG) => createStartIntervalsConnection({ oauth, now: () => NOW });

  it("hands a valid link over to Intervals.icu, with the link as state", () => {
    const outcome = start().execute(state());
    expect(outcome.status).toBe("ready");
    const url = new URL(outcome.status === "ready" ? outcome.authorizeUrl : "");
    expect(url.searchParams.get("state")).toBe(state());
  });

  it.each([
    ["an expired link", state(new Date("2026-10-10T10:00:00Z")), ConnectionResult.ExpiredLink],
    ["a forged link", `${state()}x`, ConnectionResult.InvalidLink],
    ["no link at all", undefined, ConnectionResult.InvalidLink]
  ])("refuses %s", (_label, token, status) => {
    expect(start().execute(token)).toEqual({ status });
  });

  it("says when OAuth is not configured", () => {
    expect(start(null).execute(state())).toEqual({ status: ConnectionResult.Unavailable });
  });
});

describe("completeIntervalsConnection", () => {
  function setup(overrides: { athlete?: Athlete | null; exchange?: CodeExchange; assessFails?: boolean; oauth?: null } = {}) {
    const calls: string[] = [];
    const exchanger = {
      exchange: vi.fn(async () => {
        calls.push("exchange");
        return overrides.exchange ?? EXCHANGED;
      })
    };
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
      oauth: overrides.oauth === null ? null : { config: CONFIG, exchanger },
      repo: { findById: vi.fn(async () => (overrides.athlete === undefined ? ATHLETE : overrides.athlete)) },
      store: { save },
      assessOnboarding: { execute: assess },
      brain: { appendUserMessage },
      now: () => NOW
    });
    return { useCase, exchanger, save, appendUserMessage, calls };
  }

  it("stores the token as an OAuth credential, then wakes the onboarding agent", async () => {
    const { useCase, save, appendUserMessage, calls } = setup();

    expect(await useCase.execute({ state: state(), code: "code-1" })).toEqual({
      result: ConnectionResult.Connected,
      agent: AgentNotice.Notified
    });
    expect(calls).toEqual(["exchange", "save", "append"]);
    expect(save).toHaveBeenCalledWith(ATHLETE.id, { type: "oauth", accessToken: "token-123" }, "i42");
    const [sessionId, turn] = appendUserMessage.mock.calls[0] as unknown as [string, string];
    expect(sessionId).toBe("sesn_onboarding");
    expect(turn).toContain("onboarding_fait: intervals_connected\nonboarding_manquant: body\nevenement: intervals_connecte\nmessage: \"\"");
  });

  it("keeps the connection when the agent cannot be told", async () => {
    const { useCase, save } = setup({ assessFails: true });
    expect(await useCase.execute({ state: state(), code: "code-1" })).toEqual({
      result: ConnectionResult.Connected,
      agent: AgentNotice.Failed
    });
    expect(save).toHaveBeenCalled();
  });

  it("does not wake a coordinator: only onboarding knows the event", async () => {
    const { useCase, appendUserMessage } = setup({ athlete: { ...ATHLETE, status: "active" } });
    expect(await useCase.execute({ state: state(), code: "code-1" })).toEqual({
      result: ConnectionResult.Connected,
      agent: AgentNotice.NotNeeded
    });
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["the athlete declined", { error: "access_denied", state: state() }, {}, ConnectionResult.Denied],
    ["Intervals.icu sent another error", { error: "server_error", state: state() }, {}, ConnectionResult.Failed],
    ["the state is forged", { state: "forged.state", code: "code-1" }, {}, ConnectionResult.InvalidLink],
    ["the link expired", { state: state(new Date("2026-10-01T10:00:00Z")), code: "code-1" }, {}, ConnectionResult.ExpiredLink],
    ["no code came back", { state: state() }, {}, ConnectionResult.Failed],
    ["the athlete is gone", { state: state(), code: "code-1" }, { athlete: null }, ConnectionResult.InvalidLink],
    ["the athlete is blocked", { state: state(), code: "code-1" }, { athlete: { ...ATHLETE, status: "blocked" as const } }, ConnectionResult.InvalidLink],
    ["the code is refused", { state: state(), code: "old" }, { exchange: { status: "rejected", httpStatus: 400 } as const }, ConnectionResult.Failed],
    [
      "a scope was unticked",
      { state: state(), code: "code-1" },
      { exchange: { ...EXCHANGED, token: { ...EXCHANGED.token, scopes: ["ACTIVITY:READ", "WELLNESS:READ"] } } },
      ConnectionResult.MissingScopes
    ],
    ["OAuth is not configured", { state: state(), code: "code-1" }, { oauth: null }, ConnectionResult.Unavailable]
  ])("stores nothing when %s", async (_label, callback, overrides, result) => {
    const { useCase, save, appendUserMessage } = setup(overrides as Parameters<typeof setup>[0]);
    expect(await useCase.execute(callback)).toEqual({ result });
    expect(save).not.toHaveBeenCalled();
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("throws on an outage of the exchange, storing nothing", async () => {
    const { useCase, exchanger, save } = setup();
    exchanger.exchange.mockRejectedValueOnce(new Error("Intervals.icu token endpoint answered 503."));
    await expect(useCase.execute({ state: state(), code: "code-1" })).rejects.toThrow("503");
    expect(save).not.toHaveBeenCalled();
  });
});
