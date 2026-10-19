import { describe, expect, it, vi } from "vitest";
import { intervalsOAuthConfig, type IntervalsOAuthConfig } from "./credentials";
import { authorizeUrl, createIntervalsTokenExchanger, normaliseIntervalsAthleteId } from "./intervalsOAuth";

const CONFIG: IntervalsOAuthConfig = {
  clientId: "inigo",
  clientSecret: "client-secret-0123456789",
  publicUrl: "https://app.inigo-coach.com"
};

describe("intervalsOAuthConfig", () => {
  it("reads the app from the environment, without a trailing slash on the URL", () => {
    expect(
      intervalsOAuthConfig({
        INTERVALS_OAUTH_CLIENT_ID: "inigo",
        INTERVALS_OAUTH_CLIENT_SECRET: "client-secret-0123456789",
        COACH_PUBLIC_URL: "https://app.inigo-coach.com/"
      })
    ).toEqual(CONFIG);
  });

  it.each([
    ["nothing set", {}],
    ["no secret", { INTERVALS_OAUTH_CLIENT_ID: "inigo", COACH_PUBLIC_URL: "https://app.inigo-coach.com" }],
    [
      "a URL that is not one",
      { INTERVALS_OAUTH_CLIENT_ID: "inigo", INTERVALS_OAUTH_CLIENT_SECRET: "client-secret-0123456789", COACH_PUBLIC_URL: "app" }
    ]
  ])("fails closed with %s", (_label, env) => {
    expect(intervalsOAuthConfig(env)).toBeNull();
  });
});

describe("authorizeUrl", () => {
  it("asks Intervals.icu for the coach's scopes, back to our callback, carrying the state", () => {
    const url = new URL(authorizeUrl(CONFIG, "state-token"));
    expect(`${url.origin}${url.pathname}`).toBe("https://intervals.icu/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "inigo",
      redirect_uri: "https://app.inigo-coach.com/connect/intervals/callback",
      scope: "ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE,SETTINGS:WRITE",
      state: "state-token"
    });
  });
});

describe("normaliseIntervalsAthleteId", () => {
  it("prefixes a bare number and keeps an i-id", () => {
    expect(normaliseIntervalsAthleteId("2049151")).toBe("i2049151");
    expect(normaliseIntervalsAthleteId("i2049151")).toBe("i2049151");
  });
});

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

describe("createIntervalsTokenExchanger", () => {
  it("posts the code form-encoded and reads the token, scopes and athlete", async () => {
    const fetchImpl = respond(200, {
      token_type: "Bearer",
      access_token: "token-123",
      scope: "ACTIVITY:READ,WELLNESS:READ",
      athlete: { id: "2049151", name: "David" }
    });
    const exchange = await createIntervalsTokenExchanger(CONFIG, { fetchImpl }).exchange("code-1");

    expect(exchange).toEqual({
      status: "exchanged",
      token: { accessToken: "token-123", scopes: ["ACTIVITY:READ", "WELLNESS:READ"], intervalsAthleteId: "i2049151", athleteName: "David" }
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://intervals.icu/api/oauth/token");
    expect(init.method).toBe("POST");
    const form = init.body as URLSearchParams;
    expect(form.get("client_id")).toBe("inigo");
    expect(form.get("client_secret")).toBe(CONFIG.clientSecret);
    expect(form.get("code")).toBe("code-1");
  });

  it("returns a refused code (4xx) rather than throwing", async () => {
    const exchange = await createIntervalsTokenExchanger(CONFIG, { fetchImpl: respond(400, { error: "invalid_grant" }) }).exchange("old");
    expect(exchange).toEqual({ status: "rejected", httpStatus: 400 });
  });

  it("throws on an outage, without the secret or the code in the message", async () => {
    const failing = createIntervalsTokenExchanger(CONFIG, { fetchImpl: respond(503, {}) }).exchange("code-1");
    await expect(failing).rejects.toThrow("Intervals.icu token endpoint answered 503.");
  });

  it("throws on a body it cannot read", async () => {
    const failing = createIntervalsTokenExchanger(CONFIG, { fetchImpl: respond(200, { token: "?" }) }).exchange("code-1");
    await expect(failing).rejects.toThrow("unexpected body");
  });
});
