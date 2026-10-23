import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("../../../../src/deps", () => ({ getDeps: () => ({ repo: {} }) }));
vi.mock("../../../../src/intervals/oauth/intervalsOAuth", () => ({ intervalsOAuth: () => null }));
vi.mock("../../../../src/use-cases/startIntervalsConnection", () => ({
  createStartIntervalsConnection: () => ({ execute })
}));
const SIGNED_IN = { state: "athlete", athleteId: "550e8400-e29b-41d4-a716-446655440000" };
const whoIsSignedIn = vi.fn(async (_headers: Headers) => SIGNED_IN);
vi.mock("../../../../src/identity/sessions", () => ({ whoIsSignedIn: (headers: Headers) => whoIsSignedIn(headers) }));

beforeEach(() => {
  execute.mockReset();
  whoIsSignedIn.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const start = (headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) =>
  new Request("https://app.inigo-coach.com/connect/intervals/start", { headers });

describe("GET /connect/intervals/start", () => {
  it("keeps the flow in a cookie and leaves for Intervals.icu", async () => {
    execute.mockResolvedValue({
      status: "ready",
      holder: { displayName: "Thomas", phoneHint: "01" },
      authorizeUrl: "https://intervals.icu/oauth/authorize?state=t~n",
      flow: { state: "t~n", codeVerifier: "v" }
    });
    const { GET } = await import("./route");

    const response = await GET(start({ "sec-fetch-site": "same-origin", cookie: "session=s" }));

    expect(whoIsSignedIn.mock.calls[0]?.[0].get("cookie")).toBe("session=s");
    expect(execute).toHaveBeenCalledWith({ signedIn: SIGNED_IN, linkFailed: false });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://intervals.icu/oauth/authorize?state=t~n");
    expect(response.headers.get("set-cookie")).toMatch(/^inigo_intervals_connect=[\w-]+; /);
  });

  it("sends a browser no athlete is signed in on to the result page, without a cookie", async () => {
    execute.mockResolvedValue({ status: "invalid_link" });
    const { GET } = await import("./route");

    const response = await GET(start());

    expect(response.headers.get("location")).toBe("https://app.inigo-coach.com/connect/intervals/done?result=invalid_link");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["opened from WhatsApp", { "sec-fetch-site": "none" }],
    ["linked from another site", { "sec-fetch-site": "cross-site" }],
    ["without fetch metadata nor referrer", {}],
    ["with another site as referrer", { referer: "https://evil.example/x" }]
  ])("sends a request %s back to the page, without a cookie", async (_label, headers) => {
    const { GET } = await import("./route");

    const response = await GET(start(headers));

    expect(execute).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.inigo-coach.com/connect/intervals");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("accepts the click from our page on a browser without fetch metadata", async () => {
    execute.mockResolvedValue({ status: "invalid_link" });
    const { GET } = await import("./route");

    await GET(start({ referer: "https://app.inigo-coach.com/connect/intervals" }));

    expect(execute).toHaveBeenCalled();
  });

  it("shows an outage as a failure, never a 500", async () => {
    execute.mockRejectedValue(new Error("neon down"));
    const { GET } = await import("./route");

    const response = await GET(start());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("result=failed");
  });
});
