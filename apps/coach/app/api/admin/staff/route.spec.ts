import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AS_ATHLETE, AS_STAFF, FAKE_STAFF_EMAIL } from "../../../../src/identity/sessions.fake";

const invite = vi.fn();
const remove = vi.fn();

vi.mock("../../../../src/identity/sessions", () => import("../../../../src/identity/sessions.fake"));
vi.mock("../../../../src/deps", () => ({ getDeps: () => ({ staff: { invite, remove } }) }));

function request(method: "POST" | "DELETE", body: unknown, headers: Record<string, string> = { ...AS_STAFF }) {
  return new Request("http://localhost/api/admin/staff", {
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

describe("POST /api/admin/staff", () => {
  it("invites the email with its roles, on behalf of the signed in member", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("POST", { email: "New@Example.com", roles: ["coach"] }));
    expect(response.status).toBe(200);
    expect(invite).toHaveBeenCalledWith("new@example.com", ["coach"], FAKE_STAFF_EMAIL);
  });

  it("answers 409 for an email already a member", async () => {
    invite.mockResolvedValue(false);
    const { POST } = await import("./route");
    expect((await POST(request("POST", { email: "a@example.com", roles: ["admin"] }))).status).toBe(409);
  });

  it.each([
    ["an invalid email", { email: "not an email", roles: ["admin"] }],
    ["no role", { email: "a@example.com", roles: [] }],
    ["an unknown role", { email: "a@example.com", roles: ["owner"] }],
    ["no roles at all", { email: "a@example.com" }]
  ])("refuses %s", async (_label, body) => {
    const { POST } = await import("./route");
    const response = await POST(request("POST", body));
    expect(response.status).toBe(400);
    expect(invite).not.toHaveBeenCalled();
  });

  it.each([
    ["without a session", {}, 401],
    ["with an athlete's session", { ...AS_ATHLETE }, 403]
  ])("refuses %s", async (_label, headers, status) => {
    const { POST } = await import("./route");
    expect((await POST(request("POST", { email: "a@example.com", roles: ["admin"] }, headers))).status).toBe(status);
    expect(invite).not.toHaveBeenCalled();
  });

  it("answers 502 when the database refuses the write", async () => {
    invite.mockRejectedValue(new Error("neon down"));
    const { POST } = await import("./route");
    expect((await POST(request("POST", { email: "a@example.com", roles: ["admin"] }))).status).toBe(502);
  });
});

describe("DELETE /api/admin/staff", () => {
  it("removes another member", async () => {
    const { DELETE } = await import("./route");
    expect((await DELETE(request("DELETE", { email: "other@example.com" }))).status).toBe(200);
    expect(remove).toHaveBeenCalledWith("other@example.com");
  });

  it("never removes the signed in member", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(request("DELETE", { email: FAKE_STAFF_EMAIL }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "cannot_remove_yourself" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("answers 404 for an email that was not a member", async () => {
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
