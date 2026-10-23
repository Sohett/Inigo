import { describe, it, expect, beforeEach, vi } from "vitest";
import { AS_ATHLETE, AS_COACH } from "../../../../src/identity/sessions.fake";

const setWhatsappNumber = vi.fn();

vi.mock("../../../../src/identity/sessions", () => import("../../../../src/identity/sessions.fake"));
vi.mock("../../../../src/deps", () => ({
  getDeps: () => ({ whatsappGateway: { setWhatsappNumber } })
}));

function post(body: unknown, headers: Record<string, string> = { ...AS_COACH }) {
  return new Request("http://localhost/api/admin/whatsapp-number", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  setWhatsappNumber.mockReset();
  setWhatsappNumber.mockResolvedValue(true);
});

describe("POST /api/admin/whatsapp-number", () => {
  it("records the number, spaces removed", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ whatsappNumber: "+32 470 12 34 56" }));
    expect(response.status).toBe(200);
    expect(setWhatsappNumber).toHaveBeenCalledWith("+32470123456");
  });

  it("reads an empty field as cleared", async () => {
    const { POST } = await import("./route");
    await POST(post({ whatsappNumber: "" }));
    expect(setWhatsappNumber).toHaveBeenCalledWith(null);
  });

  it("rejects a number without its country code", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ whatsappNumber: "0470123456" }));
    expect(response.status).toBe(400);
    expect(setWhatsappNumber).not.toHaveBeenCalled();
  });

  it("answers 409 while no gateway session is recorded", async () => {
    setWhatsappNumber.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(post({ whatsappNumber: "+32470123456" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "whatsapp_session_missing" });
  });

  it("refuses an athlete's session", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ whatsappNumber: null }, { ...AS_ATHLETE }));
    expect(response.status).toBe(403);
    expect(setWhatsappNumber).not.toHaveBeenCalled();
  });

  it("refuses without a session", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ whatsappNumber: null }, {}));
    expect(response.status).toBe(401);
    expect(setWhatsappNumber).not.toHaveBeenCalled();
  });

  it("answers 502 when the database refuses the write", async () => {
    setWhatsappNumber.mockRejectedValue(new Error("neon down"));
    const { POST } = await import("./route");
    const response = await POST(post({ whatsappNumber: null }));
    expect(response.status).toBe(502);
  });
});
