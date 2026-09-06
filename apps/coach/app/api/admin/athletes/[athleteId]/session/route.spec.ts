import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Athlete } from "../../../../../../src/domain/athlete";
import type { RunningSession } from "../../../../../../src/domain/brain";

const ADMIN_USER = "inigo";
const ADMIN_PASSWORD = "a-very-long-admin-password";

const athlete: Athlete = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Thomas",
  phoneNum: "+32470000000",
  whatsappLid: null,
  chatId: null,
  status: "active",
  anthropicSessionId: "sesn_old",
  managedAgentId: "agent_old"
};

const running: RunningSession = {
  sessionId: "sesn_old",
  agentId: "agent_coord",
  agentName: "inigo-coordinateur",
  agentVersion: 16,
  status: "idle",
  environmentId: "env_1",
  vaultIds: ["vlt_1"],
  resources: []
};

// The fakes the route sees instead of the real Neon/Anthropic clients. Reassigned per test.
const fake = {
  findById: vi.fn(),
  setSession: vi.fn(),
  readSession: vi.fn(),
  createSession: vi.fn()
};

// `requireAdmin` reads the credentials from the environment, not from here.
vi.mock("../../../../../../src/deps", () => ({
  getDeps: () => ({
    repo: { findById: fake.findById, setSession: fake.setSession },
    brain: { readSession: fake.readSession, createSession: fake.createSession }
  })
}));

const basic = (user = ADMIN_USER, password = ADMIN_PASSWORD) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

function post(athleteId: string, headers: Record<string, string> = {}, body?: string) {
  return new Request(`http://localhost/api/admin/athletes/${athleteId}/session`, {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body })
  });
}

const params = (athleteId: string) => ({ params: Promise.resolve({ athleteId }) });

beforeAll(() => {
  process.env["ADMIN_USER"] = ADMIN_USER;
  process.env["ADMIN_PASSWORD"] = ADMIN_PASSWORD;
});

beforeEach(() => {
  process.env["ADMIN_USER"] = ADMIN_USER;
  process.env["ADMIN_PASSWORD"] = ADMIN_PASSWORD;
  fake.findById.mockReset().mockResolvedValue(athlete);
  fake.setSession.mockReset().mockResolvedValue(undefined);
  fake.readSession.mockReset().mockResolvedValue(running);
  fake.createSession.mockReset().mockResolvedValue({ sessionId: "sesn_new", agentVersion: 17 });
});

describe("POST /api/admin/athletes/[athleteId]/session", () => {
  it("rejects a request with no credentials (401) and challenges the browser", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(athlete.id), params(athlete.id));

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the admin is not configured", async () => {
    delete process.env["ADMIN_USER"];
    delete process.env["ADMIN_PASSWORD"];
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { authorization: basic() }),
      params(athlete.id)
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "admin_not_configured" });
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("rejects wrong credentials (401)", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { authorization: basic(ADMIN_USER, "a-very-long-wrong-password") }),
      params(athlete.id)
    );

    expect(response.status).toBe(401);
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID athlete id (400)", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post("not-a-uuid", { authorization: basic() }),
      params("not-a-uuid")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_athlete_id" });
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("clones the running session and returns the new id (200)", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { authorization: basic() }),
      params(athlete.id)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sessionId: "sesn_new",
      agentVersion: 17,
      previousSessionId: "sesn_old",
      source: "cloned"
    });
    expect(fake.readSession).toHaveBeenCalledWith("sesn_old");
    expect(fake.setSession).toHaveBeenCalledWith(athlete.id, "sesn_new", "agent_coord");
  });

  it("answers 404 for an unknown athlete", async () => {
    fake.findById.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { authorization: basic() }),
      params(athlete.id)
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "athlete_not_found" });
  });

  it("answers 409 for an athlete with no session and no elements supplied", async () => {
    fake.findById.mockResolvedValue({ ...athlete, anthropicSessionId: null });
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { authorization: basic() }),
      params(athlete.id)
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "no_session_to_clone" });
  });

  it("opens a first session from the supplied elements (200)", async () => {
    fake.findById.mockResolvedValue({ ...athlete, anthropicSessionId: null });
    const { POST } = await import("./route");
    const response = await POST(
      post(
        athlete.id,
        { authorization: basic(), "content-type": "application/json" },
        JSON.stringify({ agentId: "agent_coord", environmentId: "env_1", vaultIds: ["vlt_1"] })
      ),
      params(athlete.id)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, source: "chosen" });
    expect(fake.readSession).not.toHaveBeenCalled();
  });

  it("answers 400 with the offending fields when the elements are malformed", async () => {
    fake.findById.mockResolvedValue({ ...athlete, anthropicSessionId: null });
    const { POST } = await import("./route");
    const response = await POST(
      post(
        athlete.id,
        { authorization: basic(), "content-type": "application/json" },
        JSON.stringify({ agentId: "nope", environmentId: "env_1" })
      ),
      params(athlete.id)
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; issues: string[] };
    expect(body.error).toBe("invalid_elements");
    expect(body.issues.join(" ")).toContain("agentId");
  });

  it("answers 502 when Anthropic fails", async () => {
    fake.createSession.mockRejectedValue(new Error("anthropic down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { authorization: basic() }),
      params(athlete.id)
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: "session_start_failed" });
    expect(fake.setSession).not.toHaveBeenCalled();
  });
});
