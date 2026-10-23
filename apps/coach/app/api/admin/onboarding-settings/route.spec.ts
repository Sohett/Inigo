import { describe, it, expect, beforeEach, vi } from "vitest";
import { AS_ATHLETE, AS_COACH } from "../../../../src/identity/sessions.fake";

const set = vi.fn();

vi.mock("../../../../src/identity/sessions", () => import("../../../../src/identity/sessions.fake"));
vi.mock("../../../../src/deps", () => ({
  getDeps: () => ({ onboardingSettings: { set } })
}));

function post(body: unknown, headers: Record<string, string> = { ...AS_COACH }) {
  return new Request("http://localhost/api/admin/onboarding-settings", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  set.mockReset();
  set.mockResolvedValue(undefined);
});

describe("POST /api/admin/onboarding-settings", () => {
  it("records the settings, trimmed", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post({
        onboardingAgentId: "agent_onb",
        coordinatorAgentId: "agent_coord",
        accessCode: " VELO26 "
      })
    );
    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith({
      onboardingAgentId: "agent_onb",
      coordinatorAgentId: "agent_coord",
      accessCode: "VELO26"
    });
  });

  it("reads an empty field as cleared, which turns onboarding off", async () => {
    const { POST } = await import("./route");
    await POST(post({ onboardingAgentId: "", coordinatorAgentId: "agent_coord", accessCode: "" }));
    expect(set).toHaveBeenCalledWith({
      onboardingAgentId: null,
      coordinatorAgentId: "agent_coord",
      accessCode: null
    });
  });

  it.each([
    ["an id that is not an agent", { onboardingAgentId: "env_1", coordinatorAgentId: null, accessCode: null }],
    ["a code too short to guess", { onboardingAgentId: null, coordinatorAgentId: null, accessCode: "ab" }]
  ])("rejects %s", async (_label, body) => {
    const { POST } = await import("./route");
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expect(set).not.toHaveBeenCalled();
  });

  it("refuses an athlete's session", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ onboardingAgentId: null, coordinatorAgentId: null, accessCode: null }, { ...AS_ATHLETE }));
    expect(response.status).toBe(403);
    expect(set).not.toHaveBeenCalled();
  });

  it("refuses without a session", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ onboardingAgentId: null, coordinatorAgentId: null, accessCode: null }, {}));
    expect(response.status).toBe(401);
    expect(set).not.toHaveBeenCalled();
  });

  it("answers 502 when the database refuses the write", async () => {
    set.mockRejectedValue(new Error("neon down"));
    const { POST } = await import("./route");
    const response = await POST(post({ onboardingAgentId: null, coordinatorAgentId: null, accessCode: null }));
    expect(response.status).toBe(502);
  });
});
