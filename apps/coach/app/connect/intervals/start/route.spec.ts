import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("../../../../src/deps", () => ({ getDeps: () => ({ repo: {} }) }));
vi.mock("../../../../src/use-cases/startIntervalsConnection", () => ({
  createStartIntervalsConnection: () => ({ execute })
}));

beforeEach(() => {
  execute.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const start = (query: string, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) =>
  new Request(`https://app.inigo-coach.com/connect/intervals/start?${query}`, { headers });

describe("GET /connect/intervals/start", () => {
  it("sets the browser nonce cookie and leaves for Intervals.icu", async () => {
    execute.mockResolvedValue({
      status: "ready",
      holder: { displayName: "Thomas", phoneHint: "01" },
      authorizeUrl: "https://intervals.icu/oauth/authorize?state=t~n",
      browserNonce: "n"
    });
    const { GET } = await import("./route");

    const response = await GET(start("t=the-token"));

    expect(execute).toHaveBeenCalledWith("the-token");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://intervals.icu/oauth/authorize?state=t~n");
    expect(response.headers.get("set-cookie")).toMatch(/^inigo_intervals_connect=n; /);
  });

  it("sends an unusable link to the result page, without a cookie", async () => {
    execute.mockResolvedValue({ status: "expired_link" });
    const { GET } = await import("./route");

    const response = await GET(start("t=old"));

    expect(response.headers.get("location")).toBe("https://app.inigo-coach.com/connect/intervals/done?result=expired_link");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["opened from WhatsApp", { "sec-fetch-site": "none" }],
    ["linked from another site", { "sec-fetch-site": "cross-site" }],
    ["without fetch metadata nor referrer", {}],
    ["with another site as referrer", { referer: "https://evil.example/x" }]
  ])("sends a request %s back to the page, without a cookie", async (_label, headers) => {
    const { GET } = await import("./route");

    const response = await GET(start("t=the-token", headers));

    expect(execute).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.inigo-coach.com/connect/intervals?t=the-token");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("accepts the click from our page on a browser without fetch metadata", async () => {
    execute.mockResolvedValue({ status: "expired_link" });
    const { GET } = await import("./route");

    await GET(start("t=the-token", { referer: "https://app.inigo-coach.com/connect/intervals?t=the-token" }));

    expect(execute).toHaveBeenCalledWith("the-token");
  });

  it("shows an outage as a failure, never a 500", async () => {
    execute.mockRejectedValue(new Error("neon down"));
    const { GET } = await import("./route");

    const response = await GET(start("t=x"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("result=failed");
  });
});
