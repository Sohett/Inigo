import { describe, it, expect, beforeAll } from "vitest";

// Set a valid environment before the route module (and its config loader) runs.
beforeAll(() => {
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
  process.env["DATABASE_URL"] = "postgresql://user:pass@host/db?sslmode=require";
  process.env["DB_ENCRYPTION_KEY"] = Buffer.alloc(32).toString("base64");
  process.env["MCP_BEARER_TOKEN"] = "a-very-long-mcp-bearer-token";
  // Deliberately UNUSABLE admin credentials (a too-short password, the state that broke
  // production): the MCP endpoints must not depend on the admin. When these lived in the
  // shared config schema, this value turned a valid bearer into a 401.
  process.env["ADMIN_USER"] = "x";
  process.env["ADMIN_PASSWORD"] = "short";
});

describe("athlete-data MCP route", () => {
  it("exports GET and POST handlers", async () => {
    const route = await import("./route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });

  // Regression: with the admin credentials required in the shared config, `getDeps()`
  // threw inside the auth verifier and `withMcpAuth` turned it into a 401 — the brain
  // silently lost its data access even with the right token.
  it("accepts a valid bearer token and answers the MCP call", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/mcp", {
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
    const request = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
