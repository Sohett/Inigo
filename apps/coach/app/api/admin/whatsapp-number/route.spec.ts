import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const ADMIN_USER = "inigo";
const ADMIN_PASSWORD = "a-very-long-admin-password";

const setWhatsappNumber = vi.fn();

// `requireAdmin` reads the credentials from the environment, not from here.
vi.mock("../../../../src/deps", () => ({
  getDeps: () => ({ whatsappGateway: { setWhatsappNumber } })
}));

const basic = `Basic ${Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString("base64")}`;

function post(body: unknown, headers: Record<string, string> = { authorization: basic }) {
  return new Request("http://localhost/api/admin/whatsapp-number", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

beforeAll(() => {
  process.env["ADMIN_USER"] = ADMIN_USER;
  process.env["ADMIN_PASSWORD"] = ADMIN_PASSWORD;
});

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

  it("refuses without admin credentials", async () => {
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
