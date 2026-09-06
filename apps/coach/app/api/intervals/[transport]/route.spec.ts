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

describe("intervals MCP route", () => {
  it("exports GET and POST handlers", async () => {
    const route = await import("./route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });

  it("rejects requests without a bearer token (401)", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/intervals/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
