import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Athlete } from "../../../../../../src/domain/athlete";
import type { BrainSessionTemplate } from "../../../../../../src/domain/brain";

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

const template: BrainSessionTemplate = {
  coordinatorAgentId: "agent_coord",
  environmentId: "env_1",
  vaultIds: ["vlt_1"],
  memoryStoreId: null,
  memoryStoreAccess: "read_only",
  updatedAt: new Date("2026-09-01T00:00:00Z")
};

// The fakes the route sees instead of the real Neon/Anthropic clients. Reassigned per test.
const fake = {
  findById: vi.fn(),
  setSession: vi.fn(),
  getTemplate: vi.fn(),
  createSession: vi.fn()
};

vi.mock("../../../../../../src/deps", () => ({
  getDeps: () => ({
    config: { ADMIN_USER, ADMIN_PASSWORD },
    repo: { findById: fake.findById, setSession: fake.setSession },
    brainConfig: { get: fake.getTemplate },
    brain: { createSession: fake.createSession }
  })
}));

const basic = (user = ADMIN_USER, password = ADMIN_PASSWORD) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

function post(athleteId: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/admin/athletes/${athleteId}/session`, {
    method: "POST",
    headers
  });
}

const params = (athleteId: string) => ({ params: Promise.resolve({ athleteId }) });

beforeAll(() => {
  process.env["ADMIN_USER"] = ADMIN_USER;
  process.env["ADMIN_PASSWORD"] = ADMIN_PASSWORD;
});

beforeEach(() => {
  fake.findById.mockReset().mockResolvedValue(athlete);
  fake.setSession.mockReset().mockResolvedValue(undefined);
  fake.getTemplate.mockReset().mockResolvedValue(template);
  fake.createSession.mockReset().mockResolvedValue({ sessionId: "sesn_new", agentVersion: 16 });
});

describe("POST /api/admin/athletes/[athleteId]/session", () => {
  it("rejects a request with no credentials (401) and challenges the browser", async () => {
    const { POST } = await import("./route");
    const response = await POST(post(athlete.id), params(athlete.id));

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
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

  it("creates the session and returns its id (200)", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { authorization: basic() }),
      params(athlete.id)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sessionId: "sesn_new",
      agentVersion: 16,
      previousSessionId: "sesn_old"
    });
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

  it("answers 409 when the brain has no template", async () => {
    fake.getTemplate.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(
      post(athlete.id, { authorization: basic() }),
      params(athlete.id)
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "brain_not_configured" });
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
