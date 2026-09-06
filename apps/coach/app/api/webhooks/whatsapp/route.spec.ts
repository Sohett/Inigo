import { describe, it, expect, beforeAll } from "vitest";

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
  delete process.env["WHATSAPP_WEBHOOK_SECRET"];
});

function post(body: string): Request {
  return new Request("http://localhost/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
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

  it("answers 400 on malformed JSON", async () => {
    const { POST } = await import("./route");
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });
});
