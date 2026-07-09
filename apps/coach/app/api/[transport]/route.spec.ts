import { describe, it, expect, beforeAll } from "vitest";

// Set a valid environment before the route module (and its config loader) runs.
beforeAll(() => {
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
  process.env["DATABASE_URL"] = "postgresql://user:pass@host/db?sslmode=require";
  process.env["DB_ENCRYPTION_KEY"] = Buffer.alloc(32).toString("base64");
  process.env["MCP_BEARER_TOKEN"] = "a-very-long-mcp-bearer-token";
});

describe("athlete-data MCP route", () => {
  it("exports GET and POST handlers", async () => {
    const route = await import("./route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
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
