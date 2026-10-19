import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { intervalsOAuthConfig, type IntervalsOAuthConfig } from "./credentials";
import { createIntervalsOAuthClient, linkTokenOf, normaliseIntervalsAthleteId } from "./intervalsOAuth";

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

describe("normaliseIntervalsAthleteId", () => {
  it("prefixes a bare number and keeps an i-id", () => {
    expect(normaliseIntervalsAthleteId("2049151")).toBe("i2049151");
    expect(normaliseIntervalsAthleteId("i2049151")).toBe("i2049151");
  });
});

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

const TOKEN_BODY = {
  token_type: "Bearer",
  access_token: "token-123",
  scope: "ACTIVITY:READ,WELLNESS:READ",
  athlete: { id: "2049151", name: "David" }
};

describe("createIntervalsOAuthClient", () => {
  describe("begin", () => {
    it("asks Intervals.icu for the coach's scopes, back to our callback, with the state and a PKCE challenge", async () => {
      const { authorizeUrl, flow } = await createIntervalsOAuthClient(CONFIG).begin("link.token.sig");
      const url = new URL(authorizeUrl);

      expect(`${url.origin}${url.pathname}`).toBe("https://intervals.icu/oauth/authorize");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: "inigo",
        redirect_uri: "https://app.inigo-coach.com/connect/intervals/callback",
        scope: "ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE,SETTINGS:WRITE",
        state: flow.state,
        code_challenge: createHash("sha256").update(flow.codeVerifier).digest("base64url"),
        code_challenge_method: "S256"
      });
      expect(linkTokenOf(flow.state)).toBe("link.token.sig");
      expect(flow.codeVerifier).toMatch(/^[\w-]{43,}$/);
    });

    it("draws a fresh state and verifier for every flow", async () => {
      const client = createIntervalsOAuthClient(CONFIG);
      const [a, b] = await Promise.all([client.begin("t"), client.begin("t")]);
      expect(a.flow.state).not.toBe(b.flow.state);
      expect(a.flow.codeVerifier).not.toBe(b.flow.codeVerifier);
    });
  });

  describe("complete", () => {
    const FLOW = { state: "link.token.sig~random-state", codeVerifier: "verifier-0123456789-0123456789-0123456789-xyz" };
    const query = (params: Record<string, string>) => new URLSearchParams(params);

    it("posts the code with this browser's verifier, and reads the token, scopes and athlete", async () => {
      const fetchImpl = respond(200, TOKEN_BODY);
      const outcome = await createIntervalsOAuthClient(CONFIG, { fetchImpl }).complete(query({ code: "code-1", state: FLOW.state }), FLOW);

      expect(outcome).toEqual({
        status: "exchanged",
        token: { accessToken: "token-123", scopes: ["ACTIVITY:READ", "WELLNESS:READ"], intervalsAthleteId: "i2049151", athleteName: "David" }
      });
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(String(url)).toBe("https://intervals.icu/api/oauth/token");
      expect(init.method).toBe("POST");
      const form = new URLSearchParams(String(init.body));
      expect(form.get("client_id")).toBe("inigo");
      expect(form.get("client_secret")).toBe(CONFIG.clientSecret);
      expect(form.get("code")).toBe("code-1");
      expect(form.get("code_verifier")).toBe(FLOW.codeVerifier);
      expect(form.get("redirect_uri")).toBe("https://app.inigo-coach.com/connect/intervals/callback");
    });

    it.each([
      ["another state", { code: "code-1", state: "link.token.sig~other" }],
      ["no state", { code: "code-1" }]
    ])("refuses a response with %s, without calling Intervals.icu", async (_label, params) => {
      const fetchImpl = respond(200, TOKEN_BODY);
      const outcome = await createIntervalsOAuthClient(CONFIG, { fetchImpl }).complete(query(params), FLOW);
      expect(outcome).toEqual({ status: "state_mismatch" });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
      ["the athlete declined", { error: "access_denied", state: FLOW.state }, "denied"],
      ["Intervals.icu sent another error", { error: "server_error", state: FLOW.state }, "error"],
      ["no code came back", { state: FLOW.state }, "error"]
    ])("reports that %s", async (_label, params, status) => {
      const fetchImpl = respond(200, TOKEN_BODY);
      expect(await createIntervalsOAuthClient(CONFIG, { fetchImpl }).complete(query(params), FLOW)).toEqual({ status });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("returns a refused code (4xx) rather than throwing", async () => {
      const client = createIntervalsOAuthClient(CONFIG, { fetchImpl: respond(400, { error: "invalid_grant" }) });
      expect(await client.complete(query({ code: "old", state: FLOW.state }), FLOW)).toEqual({
      status: "rejected",
      httpStatus: 400,
      error: "invalid_grant"
    });
    });

    it("throws on an outage, without the secret, the code or the verifier in the message", async () => {
      const client = createIntervalsOAuthClient(CONFIG, { fetchImpl: respond(503, {}) });
      const failing = client.complete(query({ code: "code-1", state: FLOW.state }), FLOW);
      await expect(failing).rejects.toThrow("Intervals.icu token endpoint answered 503");
      const message = await failing.catch((error: Error) => error.message);
      for (const secret of [CONFIG.clientSecret, "code-1", FLOW.codeVerifier]) expect(message).not.toContain(secret);
    });

    it("throws on a token response without the athlete, without the token in the message", async () => {
      const client = createIntervalsOAuthClient(CONFIG, { fetchImpl: respond(200, { token_type: "Bearer", access_token: "token-123" }) });
      const failing = client.complete(query({ code: "code-1", state: FLOW.state }), FLOW);
      await expect(failing).rejects.toThrow("without the athlete");
      expect(await failing.catch((error: Error) => error.message)).not.toContain("token-123");
    });

    it("throws on a token response the library refuses (no token_type)", async () => {
      const client = createIntervalsOAuthClient(CONFIG, { fetchImpl: respond(200, { access_token: "token-123", athlete: { id: 1 } }) });
      const failing = client.complete(query({ code: "code-1", state: FLOW.state }), FLOW);
      await expect(failing).rejects.toThrow("answered 200");
      expect(await failing.catch((error: Error) => error.message)).not.toContain("token-123");
    });
  });
});
