import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * The guard in front of the watchdog. The check itself is covered by the use-case spec; here we
 * pin that the public URL does nothing, and reaches neither Neon nor the gateway, unless the
 * caller is the Vercel cron.
 */
function get(authorization?: string): Request {
  return new Request("http://localhost/api/cron/whatsapp-watchdog", {
    method: "GET",
    headers: authorization ? { authorization } : {}
  });
}

afterEach(() => {
  delete process.env["CRON_SECRET"];
  vi.restoreAllMocks();
});

describe("GET /api/cron/whatsapp-watchdog", () => {
  it("refuses to run (503) when CRON_SECRET is not set", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await import("./route");

    const response = await GET(get("Bearer anything"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "cron_not_configured" });
  });

  it.each([
    ["no authorization header", undefined],
    ["a wrong secret", "Bearer not-the-cron-secret"],
    ["the secret without the Bearer scheme", "a-long-enough-cron-secret"]
  ])("answers 401 with %s", async (_label, authorization) => {
    process.env["CRON_SECRET"] = "a-long-enough-cron-secret";
    const { GET } = await import("./route");

    const response = await GET(get(authorization));

    expect(response.status).toBe(401);
  });
});
