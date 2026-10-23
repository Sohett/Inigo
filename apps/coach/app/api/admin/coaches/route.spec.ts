import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AS_ATHLETE, AS_COACH, FAKE_COACH_EMAIL } from "../../../../src/identity/sessions.fake";

const invite = vi.fn();
const remove = vi.fn();

vi.mock("../../../../src/identity/sessions", () => import("../../../../src/identity/sessions.fake"));
vi.mock("../../../../src/deps", () => ({ getDeps: () => ({ coaches: { invite, remove } }) }));

function request(method: "POST" | "DELETE", body: unknown, headers: Record<string, string> = { ...AS_COACH }) {
  return new Request("http://localhost/api/admin/coaches", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  invite.mockReset().mockResolvedValue(true);
  remove.mockReset().mockResolvedValue(true);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/admin/coaches", () => {
  it("invites the email on behalf of the signed in coach", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("POST", { email: "New@Example.com" }));
    expect(response.status).toBe(200);
    expect(invite).toHaveBeenCalledWith("new@example.com", FAKE_COACH_EMAIL);
  });

  it("answers 409 for an email already invited", async () => {
    invite.mockResolvedValue(false);
    const { POST } = await import("./route");
    expect((await POST(request("POST", { email: "a@example.com" }))).status).toBe(409);
  });

  it("refuses an invalid email", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("POST", { email: "not an email" }));
    expect(response.status).toBe(400);
    expect(invite).not.toHaveBeenCalled();
  });

  it.each([
    ["without a session", {}, 401],
    ["with an athlete's session", { ...AS_ATHLETE }, 403]
  ])("refuses %s", async (_label, headers, status) => {
    const { POST } = await import("./route");
    expect((await POST(request("POST", { email: "a@example.com" }, headers))).status).toBe(status);
    expect(invite).not.toHaveBeenCalled();
  });

  it("answers 502 when the database refuses the write", async () => {
    invite.mockRejectedValue(new Error("neon down"));
    const { POST } = await import("./route");
    expect((await POST(request("POST", { email: "a@example.com" }))).status).toBe(502);
  });
});

describe("DELETE /api/admin/coaches", () => {
  it("removes another coach", async () => {
    const { DELETE } = await import("./route");
    expect((await DELETE(request("DELETE", { email: "other@example.com" }))).status).toBe(200);
    expect(remove).toHaveBeenCalledWith("other@example.com");
  });

  it("never removes the signed in coach", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(request("DELETE", { email: FAKE_COACH_EMAIL }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "cannot_remove_yourself" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("answers 404 for an email that was not invited", async () => {
    remove.mockResolvedValue(false);
    const { DELETE } = await import("./route");
    expect((await DELETE(request("DELETE", { email: "x@example.com" }))).status).toBe(404);
  });

  it("refuses an athlete's session", async () => {
    const { DELETE } = await import("./route");
    expect((await DELETE(request("DELETE", { email: "x@example.com" }, { ...AS_ATHLETE }))).status).toBe(403);
    expect(remove).not.toHaveBeenCalled();
  });
});
