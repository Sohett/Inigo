import { describe, it, expect, beforeAll } from "vitest";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";

// Set a valid environment before the route module (and its config loader) runs.
beforeAll(() => {
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
  process.env["DATABASE_URL"] = "postgresql://user:pass@host/db?sslmode=require";
  process.env["DB_ENCRYPTION_KEY"] = Buffer.alloc(32).toString("base64");
  process.env["MCP_BEARER_TOKEN"] = "a-very-long-mcp-bearer-token";
});

function params(athleteId: string) {
  return { params: Promise.resolve({ athleteId, transport: "mcp" }) };
}

describe("athlete-data MCP route", () => {
  it("exports GET and POST handlers", async () => {
    const route = await import("./route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });

  it("rejects a non-UUID athlete id (400)", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/athlete/not-a-uuid/api/mcp", { method: "POST" });
    const response = await POST(request, params("not-a-uuid"));
    expect(response.status).toBe(400);
  });

  it("rejects requests without a bearer token (401)", async () => {
    const { POST } = await import("./route");
    const request = new Request(`http://localhost/athlete/${ATHLETE_ID}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    });
    const response = await POST(request, params(ATHLETE_ID));
    expect(response.status).toBe(401);
  });
});
