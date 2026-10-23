import { describe, it, expect, beforeAll } from "vitest";

// Set a valid environment before the route module (and its config loader) runs.
beforeAll(() => {
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
  process.env["DATABASE_URL"] = "postgresql://user:pass@host/db?sslmode=require";
  process.env["DB_ENCRYPTION_KEY"] = Buffer.alloc(32).toString("base64");
  process.env["MCP_BEARER_TOKEN"] = "a-very-long-mcp-bearer-token";
  process.env["WHATSAPP_WEBHOOK_SECRET"] = "a-very-long-webhook-secret";
  // Deliberately UNUSABLE sign in (a too-short secret, no Google client): the MCP endpoints must
  // not depend on the admin. When the admin's credentials lived in the shared config schema, a
  // too-short password turned a valid bearer into a 401 (INI-85 kept the rule for Better Auth).
  process.env["BETTER_AUTH_SECRET"] = "short";
  delete process.env["GOOGLE_CLIENT_ID"];
  // And deliberately NO OpenWA variables: they live outside the shared config schema, so
  // their absence must not stop this route from serving, only calling the tool.
  delete process.env["OPENWA_BASE_URL"];
  delete process.env["OPENWA_API_KEY"];
});

describe("whatsapp MCP route", () => {
  it("exports GET and POST handlers", async () => {
    const route = await import("./route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });

  // Guards the basePath: `mcp-handler` derives its endpoint from it, so a basePath that no
  // longer matches the folder answers 404 while the 401 case keeps passing. It also proves
  // the route serves with no OpenWA credentials configured.
  it("accepts a valid bearer token and answers the MCP call", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/whatsapp/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer a-very-long-mcp-bearer-token",
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it("rejects requests without a bearer token (401)", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/whatsapp/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
