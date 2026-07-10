import { describe, it, expect, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AthleteDataStore } from "../store/athleteDataStore";
import { registerAthleteDataTools } from "./index";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";

function createMockStore(overrides: Record<string, unknown> = {}): AthleteDataStore {
  const scoped = {
    getProfile: async () => ({
      athleteId: ATHLETE_ID,
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
    updateProfile: async () => ({ athleteId: ATHLETE_ID, profile: { healthNotes: "updated" } }),
    logAdaptation: async () => ({ id: "l2", summary: "logged an adaptation" }),
    upsertGoal: async () => ({ id: "g2", title: "New goal" }),
    saveTrainingPlan: async () => ({
      plan: { id: "p1", name: "Saved plan", status: "active" },
      blocks: [{ id: "b1", orderIndex: 0, phaseType: "build" }]
    }),
    ...overrides
  };
  return { forAthlete: () => scoped } as unknown as AthleteDataStore;
}

async function connect(overrides: Record<string, unknown> = {}) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerAthleteDataTools(server, createMockStore(overrides));

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("registerAthleteDataTools", () => {
  let client: Awaited<ReturnType<typeof connect>>;

  beforeEach(async () => {
    client = await connect();
  });

  it("registers the read tools", async () => {
    const { tools } = await client.listTools();
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

  it("registers the write tools (always on)", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["update_profile", "log_adaptation", "upsert_goal", "save_training_plan"])
    );
  });

  it("requires athleteId on every tool", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema.required ?? []).toContain("athleteId");
    }
  });

  it("calls a read tool with an athleteId and returns JSON content from the store", async () => {
    const result = await client.callTool({
      name: "get_profile",
      arguments: { athleteId: ATHLETE_ID }
    });
    const content = result.content as { type: string; text: string }[];
    expect(content[0]?.type).toBe("text");
    const parsed = JSON.parse(content[0]!.text) as { displayName: string };
    expect(parsed.displayName).toBe("Thomas");
  });

  it("calls a write tool and returns the persisted row", async () => {
    const result = await client.callTool({
      name: "log_adaptation",
      arguments: { athleteId: ATHLETE_ID, summary: "logged an adaptation" }
    });
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text) as { summary: string };
    expect(parsed.summary).toBe("logged an adaptation");
  });

  it("calls save_training_plan and returns the persisted plan + blocks", async () => {
    const result = await client.callTool({
      name: "save_training_plan",
      arguments: {
        athleteId: ATHLETE_ID,
        name: "Season plan",
        startDate: "2026-07-06",
        endDate: "2026-09-20",
        status: "active",
        blocks: [
          { name: "Base", phaseType: "base", startDate: "2026-07-06", endDate: "2026-07-12" }
        ]
      }
    });
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text) as { plan: { name: string }; blocks: unknown[] };
    expect(parsed.plan.name).toBe("Saved plan");
    expect(parsed.blocks).toHaveLength(1);
  });

  it("surfaces an error when save_training_plan targets a plan not owned (store returns null)", async () => {
    // On an update the store returns null when the plan is not this athlete's; the tool must
    // surface that as an error, never a null "success".
    const notOwnedClient = await connect({ saveTrainingPlan: async () => null });
    const result = await notOwnedClient.callTool({
      name: "save_training_plan",
      arguments: {
        athleteId: ATHLETE_ID,
        id: "33333333-3333-4333-8333-333333333333",
        name: "Someone else's plan",
        startDate: "2026-07-06",
        endDate: "2026-09-20",
        blocks: [{ startDate: "2026-07-06", endDate: "2026-07-12" }]
      }
    });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toMatch(/not found for this athlete/i);
  });

  it("rejects save_training_plan when a date is not a plain YYYY-MM-DD", async () => {
    // Schema validation may surface as a thrown protocol error or an isError result — accept either.
    let errored = false;
    try {
      const result = await client.callTool({
        name: "save_training_plan",
        arguments: {
          athleteId: ATHLETE_ID,
          name: "Season plan",
          startDate: "2026-07-06T00:00:00Z",
          endDate: "2026-09-20",
          blocks: [{ startDate: "2026-07-06", endDate: "2026-07-12" }]
        }
      });
      errored = result.isError === true;
    } catch {
      errored = true;
    }
    expect(errored).toBe(true);
  });

  it("rejects upsert_goal with neither id nor title", async () => {
    const result = await client.callTool({
      name: "upsert_goal",
      arguments: { athleteId: ATHLETE_ID }
    });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toMatch(/requires a title/i);
  });

  it("rejects upsert_goal with an id but no fields to update", async () => {
    const result = await client.callTool({
      name: "upsert_goal",
      arguments: { athleteId: ATHLETE_ID, id: "22222222-2222-4222-8222-222222222222" }
    });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toMatch(/at least one field to update/i);
  });
});
