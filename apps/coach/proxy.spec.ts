import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AS_ATHLETE, AS_STAFF, AS_UNCONFIGURED } from "./src/identity/sessions.fake";

vi.mock("./src/identity/sessions", () => import("./src/identity/sessions.fake"));

const AUTH_ENV = {
  BETTER_AUTH_SECRET: "a-test-secret-that-is-long-enough-123456",
  BETTER_AUTH_URL: "https://app.inigo-coach.com",
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
  DATABASE_URL: "postgresql://user:pass@host/db"
};

/** A session cookie is there; who it belongs to is the fake's test header. */
const COOKIE = { cookie: "__Secure-better-auth.session_token=signed-token" };

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://app.inigo-coach.com${path}`, { headers });
}

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", AUTH_ENV.BETTER_AUTH_SECRET);
  vi.stubEnv("BETTER_AUTH_URL", AUTH_ENV.BETTER_AUTH_URL);
  vi.stubEnv("GOOGLE_CLIENT_ID", AUTH_ENV.GOOGLE_CLIENT_ID);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", AUTH_ENV.GOOGLE_CLIENT_SECRET);
  vi.stubEnv("DATABASE_URL", AUTH_ENV.DATABASE_URL);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("proxy (admin gate)", () => {
  it("lets a staff member through, page or API", async () => {
    const { proxy } = await import("./proxy");
    for (const path of ["/admin/athletes", "/api/admin/staff"]) {
      const response = await proxy(request(path, { ...COOKIE, ...AS_STAFF }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  // The regression the review caught: an athlete has a valid session too (any magic link opens
  // one), and the admin layout alone does not run on client navigation (RSC requests).
  it("never lets an athlete's session reach an admin page, RSC request included", async () => {
    const { proxy } = await import("./proxy");
    const response = await proxy(request("/admin/athletes", { ...COOKIE, ...AS_ATHLETE, rsc: "1" }));
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(response.headers.get("location")).toBe("https://app.inigo-coach.com/login");
  });

  it("answers 403 to an athlete's session on the admin API", async () => {
    const { proxy } = await import("./proxy");
    const response = await proxy(request("/api/admin/staff", { ...COOKIE, ...AS_ATHLETE }));
    expect(response.status).toBe(403);
  });

  it("sends a browser without a session to the sign in, and answers 401 on the API", async () => {
    const { proxy } = await import("./proxy");
    expect((await proxy(request("/admin"))).headers.get("location")).toBe("https://app.inigo-coach.com/login");
    expect((await proxy(request("/api/admin/staff"))).status).toBe(401);
  });

  it("reads a cookie whose session is gone as signed out", async () => {
    const { proxy } = await import("./proxy");
    expect((await proxy(request("/api/admin/staff", { ...COOKIE }))).status).toBe(401);
  });

  it("fails closed with 503 when sign in is not configured", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "short");
    const { proxy } = await import("./proxy");
    expect((await proxy(request("/admin", { ...COOKIE, ...AS_STAFF }))).status).toBe(503);
  });

  it("fails closed with 503 when the session store says sign in is unavailable", async () => {
    const { proxy } = await import("./proxy");
    expect((await proxy(request("/admin", { ...COOKIE, ...AS_UNCONFIGURED }))).status).toBe(503);
  });
});
