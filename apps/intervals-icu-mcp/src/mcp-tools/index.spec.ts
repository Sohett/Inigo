import { describe, it, expect, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { IntervalsIcuClient } from "../client";
import { registerIntervalsIcuTools } from "./index";

function createMockClient(): IntervalsIcuClient {
  const mock: Partial<Record<keyof IntervalsIcuClient, unknown>> = {
    getActivities: async () => [{ id: "i1", name: "Easy Run", type: "Run" }],
    getAthleteProfile: async () => ({ id: "i123", name: "Thomas" }),
    upsertEvent: async (event: Record<string, unknown>) => ({ id: 99, ...event }),
    updateSportSettings: async (sport: string, patch: Record<string, unknown>) => ({ sport, patch })
  };
  return mock as unknown as IntervalsIcuClient;
}

async function connect() {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerIntervalsIcuTools(server, createMockClient());

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("registerIntervalsIcuTools", () => {
  let mcpClient: Awaited<ReturnType<typeof connect>>;

  beforeEach(async () => {
    mcpClient = await connect();
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

  it("maps update_sport_settings args to a sport + partial patch", async () => {
    const result = await mcpClient.callTool({
      name: "update_sport_settings",
      arguments: { sport: "Ride", ftp: 265 }
    });
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text) as {
      sport: string;
      patch: Record<string, unknown>;
    };
    expect(parsed.sport).toBe("Ride");
    expect(parsed.patch).toEqual({ ftp: 265 });
  });

  it("calls a tool and returns JSON content from the client", async () => {
    const result = await mcpClient.callTool({ name: "get_activities", arguments: {} });
    const content = result.content as { type: string; text: string }[];
    expect(content[0]?.type).toBe("text");
    const parsed = JSON.parse(content[0]!.text) as { name: string }[];
    expect(parsed[0]?.name).toBe("Easy Run");
  });

  it("maps camelCase event input to the Intervals.icu snake_case payload", async () => {
    const result = await mcpClient.callTool({
      name: "create_or_update_event",
      arguments: { startDateLocal: "2026-07-01", category: "WORKOUT", name: "Intervals" }
    });
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text) as Record<string, unknown>;
    // A bare date is normalized to a full datetime: Intervals.icu 422s on a date-only value.
    expect(parsed["start_date_local"]).toBe("2026-07-01T00:00:00");
    expect(parsed["category"]).toBe("WORKOUT");
  });

  it("passes a full datetime start through unchanged", async () => {
    const result = await mcpClient.callTool({
      name: "create_or_update_event",
      arguments: { startDateLocal: "2026-07-01T09:30:00", category: "WORKOUT", name: "Intervals" }
    });
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text) as Record<string, unknown>;
    expect(parsed["start_date_local"]).toBe("2026-07-01T09:30:00");
  });
});
