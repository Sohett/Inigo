import { describe, it, expect, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { IntervalsIcuClient } from "../client";
import { registerIntervalsIcuTools } from "./index";
import type { ResolveClient } from "./result";

const ATHLETE_ID = "550e8400-e29b-41d4-a716-446655440000";

function createMockClient(): IntervalsIcuClient {
  const mock: Partial<Record<keyof IntervalsIcuClient, unknown>> = {
    getActivities: async () => [{ id: "i1", name: "Easy Run", type: "Run" }],
    getAthleteProfile: async () => ({ id: "i123", name: "Thomas" }),
    upsertEvent: async (event: Record<string, unknown>) => ({ id: 99, ...event }),
    updateSportSettings: async (sport: string, patch: Record<string, unknown>) => ({ sport, patch })
  };
  return mock as unknown as IntervalsIcuClient;
}

/** A resolver that records the athlete ids it was asked for and returns a fixed mock client. */
function recordingResolver(client: IntervalsIcuClient) {
  const calls: string[] = [];
  const resolve: ResolveClient = async (athleteId) => {
    calls.push(athleteId);
    return client;
  };
  return { resolve, calls };
}

async function connect(resolve: ResolveClient) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerIntervalsIcuTools(server, resolve);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

type TextContent = { type: string; text: string }[];

describe("registerIntervalsIcuTools", () => {
  let mcpClient: Awaited<ReturnType<typeof connect>>;
  let calls: string[];

  beforeEach(async () => {
    const resolver = recordingResolver(createMockClient());
    calls = resolver.calls;
    mcpClient = await connect(resolver.resolve);
  });

  it("registers the read tools", async () => {
    const { tools } = await mcpClient.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_athlete_profile",
        "get_activities",
        "get_activity",
        "get_wellness",
        "get_fitness",
        "get_power_curve",
        "get_hr_curve",
        "get_pace_curve",
        "get_events",
        "get_gear"
      ])
    );
  });

  it("registers the write tools", async () => {
    const { tools } = await mcpClient.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "create_or_update_event",
        "delete_event",
        "delete_events_by_range",
        "update_sport_settings"
      ])
    );
  });

  it("exposes athleteId as a required input on every tool", async () => {
    const { tools } = await mcpClient.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema.properties).toHaveProperty("athleteId");
      expect(tool.inputSchema.required).toContain("athleteId");
    }
  });

  it("resolves the client for the athleteId passed in the call", async () => {
    await mcpClient.callTool({ name: "get_activities", arguments: { athleteId: ATHLETE_ID } });
    expect(calls).toEqual([ATHLETE_ID]);
  });

  it("maps update_sport_settings args to a sport + partial patch (athleteId stripped)", async () => {
    const result = await mcpClient.callTool({
      name: "update_sport_settings",
      arguments: { athleteId: ATHLETE_ID, sport: "Ride", ftp: 265 }
    });
    const content = result.content as TextContent;
    const parsed = JSON.parse(content[0]!.text) as { sport: string; patch: Record<string, unknown> };
    expect(parsed.sport).toBe("Ride");
    expect(parsed.patch).toEqual({ ftp: 265 });
  });

  it("calls a tool and returns JSON content from the client", async () => {
    const result = await mcpClient.callTool({
      name: "get_activities",
      arguments: { athleteId: ATHLETE_ID }
    });
    const content = result.content as TextContent;
    expect(content[0]?.type).toBe("text");
    const parsed = JSON.parse(content[0]!.text) as { name: string }[];
    expect(parsed[0]?.name).toBe("Easy Run");
  });

  it("maps camelCase event input to the Intervals.icu snake_case payload", async () => {
    const result = await mcpClient.callTool({
      name: "create_or_update_event",
      arguments: { athleteId: ATHLETE_ID, startDateLocal: "2026-07-01", category: "WORKOUT", name: "Intervals" }
    });
    const content = result.content as TextContent;
    const parsed = JSON.parse(content[0]!.text) as Record<string, unknown>;
    // A bare date is normalized to a full datetime: Intervals.icu 422s on a date-only value.
    expect(parsed["start_date_local"]).toBe("2026-07-01T00:00:00");
    expect(parsed["category"]).toBe("WORKOUT");
  });

  it("passes a full datetime start through unchanged", async () => {
    const result = await mcpClient.callTool({
      name: "create_or_update_event",
      arguments: { athleteId: ATHLETE_ID, startDateLocal: "2026-07-01T09:30:00", category: "WORKOUT", name: "Intervals" }
    });
    const content = result.content as TextContent;
    const parsed = JSON.parse(content[0]!.text) as Record<string, unknown>;
    expect(parsed["start_date_local"]).toBe("2026-07-01T09:30:00");
  });
});

describe("registerIntervalsIcuTools without a stored credential", () => {
  it("returns a clean error result when the athlete has no key", async () => {
    const resolveNoKey: ResolveClient = async (athleteId) => {
      throw new Error(`No Intervals.icu credential stored for athlete ${athleteId}.`);
    };
    const mcpClient = await connect(resolveNoKey);

    const result = await mcpClient.callTool({
      name: "get_activities",
      arguments: { athleteId: ATHLETE_ID }
    });

    expect(result.isError).toBe(true);
    const content = result.content as TextContent;
    expect(content[0]!.text).toContain("No Intervals.icu credential");
  });
});
