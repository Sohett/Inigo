import { createHmac } from "node:crypto";
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

const SECRET = "a-very-long-webhook-secret";

/**
 * The WhatsApp webhook is the critical path: if it stops answering 200, athletes'
 * messages never reach the coach. This spec boots the route against the real config
 * loader, so anything that makes booting stricter is caught here.
 *
 * The admin credentials here are deliberately UNUSABLE (a too-short password, the exact
 * state that broke production): the admin must never be a dependency of this route. When
 * they lived in the shared config schema, this very value turned every delivery into a 500.
 */
beforeAll(() => {
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
  process.env["DATABASE_URL"] = "postgresql://user:pass@host/db?sslmode=require";
  process.env["DB_ENCRYPTION_KEY"] = Buffer.alloc(32).toString("base64");
  process.env["MCP_BEARER_TOKEN"] = "a-very-long-mcp-bearer-token";
  process.env["ADMIN_USER"] = "x";
  process.env["ADMIN_PASSWORD"] = "short";
  process.env["WHATSAPP_WEBHOOK_SECRET"] = SECRET;
  delete process.env["SLACK_ALERT_WEBHOOK_URL"];
});

/** A delivery as OpenWA sends it: signed with the shared secret, unless told otherwise. */
function post(body: string, signature: string | null = sign(body)): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["x-openwa-signature"] = signature;
  return new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", headers, body });
}

function sign(body: string, secret: string = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("POST /api/webhooks/whatsapp", () => {
  it("boots and answers 200 even with an unusable admin credential", async () => {
    const { POST } = await import("./route");
    // A payload that fails the envelope schema is ignored by the use-case, so this
    // exercises the whole boot path (config + deps) without reaching Neon.
    const response = await POST(post(JSON.stringify({ nope: true })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it.each([
    ["no signature", null],
    ["a signature made with another secret", sign("{}", "another-long-webhook-secret")],
    ["a garbage signature", "sha256=nope"]
  ])("refuses a delivery with %s, before reading it", async (_label, signature) => {
    const { POST } = await import("./route");
    const response = await POST(post("{}", signature));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_signature" });
  });

  it("refuses an unsigned session event too", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({ event: "session.status", data: { sessionId: "s", status: "disconnected" } });
    const response = await POST(post(body, null));

    expect(response.status).toBe(401);
  });

  it("answers 400 on malformed JSON", async () => {
    const { POST } = await import("./route");
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });
});

describe("POST /api/webhooks/whatsapp, session events (INI-40)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("alerts on a session stop and answers 200 without reaching the message routing", async () => {
    const { POST } = await import("./route");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await POST(
      post(
        JSON.stringify({
          // What a stop from the OpenWA dashboard sends, and nothing else (the INI-40 miss).
          event: "session.status",
          sessionId: "gateway-session",
          data: { sessionId: "gateway-session", status: "disconnected" }
        })
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    // The alert went out as a structured log line (no Slack URL configured in this spec). The
    // fake Neon cannot be read, so the event counts as the recorded session's: fail loud.
    expect(log.mock.calls.some((call) => String(call[0]).startsWith("[coach][alert] "))).toBe(true);
  });
});
