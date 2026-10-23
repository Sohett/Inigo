import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Athlete } from "../../../../../../src/domain/athlete";
import type { RunningSession } from "../../../../../../src/domain/brain";
import { AS_ATHLETE, AS_COACH, AS_UNCONFIGURED } from "../../../../../../src/identity/sessions.fake";

const athlete: Athlete = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Thomas",
  phoneNum: "+32470000000",
  whatsappLid: null,
  chatId: null,
  status: "active",
  timezone: "Europe/Brussels",
  locale: "fr",
  activeSession: { sessionId: "sesn_old", agentId: "agent_old" }
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

vi.mock("../../../../../../src/identity/sessions", () => import("../../../../../../src/identity/sessions.fake"));
vi.mock("../../../../../../src/deps", () => ({
  getDeps: () => ({
    repo: { findById: fake.findById, setSession: fake.setSession },
    brain: { readSession: fake.readSession, createSession: fake.createSession },
    onboardingSettings: {
      get: () =>
        Promise.resolve({ onboardingAgentId: "agent_onboarding", coordinatorAgentId: "agent_coord", accessCode: "code" })
    }
  })
}));

function post(athleteId: string, headers: Record<string, string> = {}, body?: string) {
  return new Request(`http://localhost/api/admin/athletes/${athleteId}/session`, {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body })
  });
}

const params = (athleteId: string) => ({ params: Promise.resolve({ athleteId }) });

beforeEach(() => {
  fake.findById.mockReset().mockResolvedValue(athlete);
  fake.setSession.mockReset().mockResolvedValue(undefined);
  fake.readSession.mockReset().mockResolvedValue(running);
  fake.createSession.mockReset().mockResolvedValue({ sessionId: "sesn_new", agentVersion: 17 });
});

describe("POST /api/admin/athletes/[athleteId]/session", () => {
  it("rejects a request without a session (401)", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(athlete.id), params(athlete.id));

    expect(response.status).toBe(401);
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when sign in is not configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    const response = await POST(post(athlete.id, { ...AS_UNCONFIGURED }), params(athlete.id));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "admin_not_configured" });
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("rejects an athlete's session (403)", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(athlete.id, { ...AS_ATHLETE }), params(athlete.id));

    expect(response.status).toBe(403);
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID athlete id (400)", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post("not-a-uuid", { ...AS_COACH }),
      params("not-a-uuid")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_athlete_id" });
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("clones the running session and returns the new id (200)", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { ...AS_COACH }),
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
      post(athlete.id, { ...AS_COACH }),
      params(athlete.id)
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "athlete_not_found" });
  });

  it("answers 409 for a blocked athlete, without opening a session", async () => {
    fake.findById.mockResolvedValue({ ...athlete, status: "blocked" });
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { ...AS_COACH }),
      params(athlete.id)
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "athlete_not_routed" });
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("answers 409 for an athlete with no session and no elements supplied", async () => {
    fake.findById.mockResolvedValue({ ...athlete, activeSession: null });
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { ...AS_COACH }),
      params(athlete.id)
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "no_session_to_clone" });
  });

  it("opens a first session from the supplied elements (200)", async () => {
    fake.findById.mockResolvedValue({ ...athlete, activeSession: null });
    const { POST } = await import("./route");
    const response = await POST(
      post(
        athlete.id,
        { ...AS_COACH, "content-type": "application/json" },
        JSON.stringify({ agentId: "agent_coord", environmentId: "env_1", vaultIds: ["vlt_1"] })
      ),
      params(athlete.id)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, source: "chosen" });
    expect(fake.readSession).not.toHaveBeenCalled();
  });

  it("answers 400 with the offending fields when the elements are malformed", async () => {
    fake.findById.mockResolvedValue({ ...athlete, activeSession: null });
    const { POST } = await import("./route");
    const response = await POST(
      post(
        athlete.id,
        { ...AS_COACH, "content-type": "application/json" },
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
      post(athlete.id, { ...AS_COACH }),
      params(athlete.id)
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: "session_start_failed" });
    expect(fake.setSession).not.toHaveBeenCalled();
  });
});
