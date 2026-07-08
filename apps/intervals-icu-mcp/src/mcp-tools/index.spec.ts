import { describe, it, expect, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { IntervalsIcuClient } from "../client";
import { registerIntervalsIcuTools, type RegisterToolsOptions } from "./index";

function createMockClient(): IntervalsIcuClient {
  const mock: Partial<Record<keyof IntervalsIcuClient, unknown>> = {
    getActivities: async () => [{ id: "i1", name: "Easy Run", type: "Run" }],
    getAthleteProfile: async () => ({ id: "i123", name: "Thomas" }),
    upsertEvent: async (event: Record<string, unknown>) => ({ id: 99, ...event })
  };
  return mock as unknown as IntervalsIcuClient;
}

async function connect(options: RegisterToolsOptions) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerIntervalsIcuTools(server, createMockClient(), options);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("registerIntervalsIcuTools", () => {
  let readOnlyClient: Awaited<ReturnType<typeof connect>>;

  beforeEach(async () => {
    readOnlyClient = await connect({ enableWriteTools: false });
  });

  it("registers the read tools", async () => {
    const { tools } = await readOnlyClient.listTools();
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

  it("does not register write tools when disabled", async () => {
    const { tools } = await readOnlyClient.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).not.toContain("create_or_update_event");
    expect(names).not.toContain("delete_event");
  });

  it("registers write tools when enabled", async () => {
    const client = await connect({ enableWriteTools: true });
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["create_or_update_event", "delete_event", "delete_events_by_range"])
    );
  });

  it("calls a tool and returns JSON content from the client", async () => {
    const result = await readOnlyClient.callTool({ name: "get_activities", arguments: {} });
    const content = result.content as { type: string; text: string }[];
    expect(content[0]?.type).toBe("text");
    const parsed = JSON.parse(content[0]!.text) as { name: string }[];
    expect(parsed[0]?.name).toBe("Easy Run");
  });

  it("maps camelCase event input to the Intervals.icu snake_case payload", async () => {
    const client = await connect({ enableWriteTools: true });
    const result = await client.callTool({
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
    const client = await connect({ enableWriteTools: true });
    const result = await client.callTool({
      name: "create_or_update_event",
      arguments: { startDateLocal: "2026-07-01T09:30:00", category: "WORKOUT", name: "Intervals" }
    });
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text) as Record<string, unknown>;
    expect(parsed["start_date_local"]).toBe("2026-07-01T09:30:00");
  });
});
