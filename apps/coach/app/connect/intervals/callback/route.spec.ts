import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("../../../../src/deps", () => ({
  getDeps: () => ({
    repo: {},
    db: {},
    brain: {},
    intervalsResolver: vi.fn(),
    config: { DB_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64") }
  })
}));
vi.mock("../../../../src/use-cases/completeIntervalsConnection", () => ({
  createCompleteIntervalsConnection: () => ({ execute })
}));

beforeEach(() => {
  execute.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

function callback(query: string, cookie?: string): Request {
  return new Request(`https://app.inigo-coach.com/connect/intervals/callback?${query}`, {
    headers: cookie ? { cookie } : {}
  });
}

describe("GET /connect/intervals/callback", () => {
  it("hands Intervals.icu's query to the use-case and redirects to the result page", async () => {
    execute.mockResolvedValue({ result: "connected", agent: "notified" });
    const { GET } = await import("./route");

    const response = await GET(callback("code=abc&state=s.t~n", "inigo_intervals_connect=n"));

    expect(execute).toHaveBeenCalledWith({ code: "abc", state: "s.t~n", error: undefined, browserNonce: "n" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.inigo-coach.com/connect/intervals/done?result=connected");
    expect(response.headers.get("cache-control")).toBe("no-store");
    // The binding is single use.
    expect(response.headers.get("set-cookie")).toMatch(/^inigo_intervals_connect=; Max-Age=0; /);
  });

  it("passes a refusal through", async () => {
    execute.mockResolvedValue({ result: "denied" });
    const { GET } = await import("./route");

    const response = await GET(callback("error=access_denied&state=s.t"));

    expect(execute).toHaveBeenCalledWith({ code: undefined, state: "s.t", error: "access_denied", browserNonce: undefined });
    expect(response.headers.get("location")).toContain("result=denied");
  });

  it("shows an outage as a failure the athlete can retry, never a 500", async () => {
    execute.mockRejectedValue(new Error("Intervals.icu token endpoint answered 503."));
    const { GET } = await import("./route");

    const response = await GET(callback("code=abc&state=s.t"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("result=failed");
  });
});
