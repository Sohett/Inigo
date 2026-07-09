import { describe, it, expect, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ScopedAthleteDataStore } from "../store/athleteDataStore";
import { registerAthleteDataTools, type RegisterToolsOptions } from "./index";

function createMockStore(): ScopedAthleteDataStore {
  const mock: Partial<Record<keyof ScopedAthleteDataStore, unknown>> = {
    getProfile: async () => ({
      athleteId: "a1",
      displayName: "Thomas",
      timezone: "Europe/Brussels",
      locale: "fr",
      status: "active",
      profile: { healthNotes: "no running while calf heals" }
    }),
    getThresholds: async () => [{ sport: "bike", ftpWatts: 282 }],
    getGoals: async () => [{ id: "g1", title: "Race", status: "active" }],
    getTrainingPlan: async () => ({ plan: { id: "p1", name: "Base" }, blocks: [] }),
    getAdaptationLog: async () => [{ id: "l1", summary: "rest day" }],
    updateProfile: async () => ({ athleteId: "a1", profile: { healthNotes: "updated" } }),
    logAdaptation: async () => ({ id: "l2", summary: "logged an adaptation" }),
    upsertGoal: async () => ({ id: "g2", title: "New goal" })
  };
  return mock as unknown as ScopedAthleteDataStore;
}

async function connect(options: RegisterToolsOptions) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerAthleteDataTools(server, createMockStore(), options);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("registerAthleteDataTools", () => {
  let readOnlyClient: Awaited<ReturnType<typeof connect>>;

  beforeEach(async () => {
    readOnlyClient = await connect({ enableWriteTools: false });
  });

  it("registers the read tools", async () => {
    const { tools } = await readOnlyClient.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_profile",
        "get_thresholds",
        "get_goals",
        "get_training_plan",
        "get_adaptation_log"
      ])
    );
  });

  it("does not register write tools when disabled", async () => {
    const { tools } = await readOnlyClient.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).not.toContain("update_profile");
    expect(names).not.toContain("log_adaptation");
    expect(names).not.toContain("upsert_goal");
  });

  it("registers write tools when enabled", async () => {
    const client = await connect({ enableWriteTools: true });
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["update_profile", "log_adaptation", "upsert_goal"])
    );
  });

  it("calls a read tool and returns JSON content from the store", async () => {
    const result = await readOnlyClient.callTool({ name: "get_profile", arguments: {} });
    const content = result.content as { type: string; text: string }[];
    expect(content[0]?.type).toBe("text");
    const parsed = JSON.parse(content[0]!.text) as { displayName: string };
    expect(parsed.displayName).toBe("Thomas");
  });

  it("calls a write tool when enabled and returns the persisted row", async () => {
    const client = await connect({ enableWriteTools: true });
    const result = await client.callTool({
      name: "log_adaptation",
      arguments: { summary: "logged an adaptation" }
    });
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text) as { summary: string };
    expect(parsed.summary).toBe("logged an adaptation");
  });

  it("rejects upsert_goal with neither id nor title", async () => {
    const client = await connect({ enableWriteTools: true });
    const result = await client.callTool({ name: "upsert_goal", arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toMatch(/requires a title/i);
  });
});
