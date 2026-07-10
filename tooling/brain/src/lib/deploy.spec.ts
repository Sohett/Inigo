import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createBrainClient } from "../client";
import { deployBrain, deployManifestSchema, type DeployInput } from "./deploy";

const API = "https://api.anthropic.com/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => createBrainClient("sk-ant-test", { maxRetries: 0 });

// PROD state the GETs return: sub A will change (system), sub B will not; the coordinator
// roster pins A v3 / B v6 and must be re-pinned to whatever the sub-agents land on.
const currentSubA = { id: "agent_a", version: 3, system: "a-old" };
const currentSubB = { id: "agent_b", version: 6, system: "b-old" };
const currentCoord = {
  id: "agent_coord",
  version: 10,
  system: "coord",
  multiagent: {
    type: "coordinator",
    agents: [
      { id: "agent_a", type: "agent", version: 3 },
      { id: "agent_b", type: "agent", version: 6 }
    ]
  }
};

const manifest = deployManifestSchema.parse({
  coordinator: "agent_coord",
  subAgents: ["agent_a", "agent_b"],
  session: {
    environmentId: "env_1",
    vaultIds: ["vlt_1"],
    resources: [{ type: "memory_store", memory_store_id: "memstore_1", access: "read_only" }]
  }
});

/** Fresh desired-state configs each run (deployBrain mutates the coordinator roster in place). */
function freshInput(): DeployInput {
  return {
    manifest,
    agentConfigs: {
      agent_a: { system: "a-new" }, // differs from current -> bumps
      agent_b: { system: "b-old" }, // identical -> no change
      agent_coord: structuredClone(currentCoord) as unknown as Record<string, unknown>
    }
  };
}

describe("deployBrain", () => {
  it("dry-run performs only reads and predicts versions + re-pin", async () => {
    server.use(
      http.get(`${API}/agents/agent_a`, () => HttpResponse.json(currentSubA)),
      http.get(`${API}/agents/agent_b`, () => HttpResponse.json(currentSubB)),
      http.get(`${API}/agents/agent_coord`, () => HttpResponse.json(currentCoord))
      // No POST handlers: onUnhandledRequest "error" fails the test if any write fires.
    );

    const report = await deployBrain(client(), freshInput(), false);

    expect(report.subAgents).toEqual([
      { id: "agent_a", fromVersion: 3, toVersion: 4, changed: ["system"] },
      { id: "agent_b", fromVersion: 6, toVersion: 6, changed: [] }
    ]);
    expect(report.coordinator.fromVersion).toBe(10);
    expect(report.coordinator.toVersion).toBe(11);
    expect(report.coordinator.changed).toEqual(["multiagent"]);
    expect(report.coordinator.repinned).toEqual([
      { id: "agent_a", version: 4 },
      { id: "agent_b", version: 6 }
    ]);
    expect(report.session.created).toBe(false);
  });

  it("apply bumps sub-agents, re-pins the coordinator to the new versions, and creates a session", async () => {
    type RosterEntry = { id: string; type: string; version: number };
    let coordBody: { multiagent?: { agents?: RosterEntry[] } } | undefined;
    let sessionBody: { agent?: unknown } | undefined;
    server.use(
      http.get(`${API}/agents/agent_a`, () => HttpResponse.json(currentSubA)),
      http.post(`${API}/agents/agent_a`, () =>
        HttpResponse.json({ ...currentSubA, version: 4, system: "a-new" })
      ),
      http.get(`${API}/agents/agent_b`, () => HttpResponse.json(currentSubB)),
      http.post(`${API}/agents/agent_b`, () => HttpResponse.json({ ...currentSubB, version: 6 })),
      http.get(`${API}/agents/agent_coord`, () => HttpResponse.json(currentCoord)),
      http.post(`${API}/agents/agent_coord`, async ({ request }) => {
        coordBody = (await request.json()) as { multiagent?: { agents?: RosterEntry[] } };
        return HttpResponse.json({ ...currentCoord, version: 11 });
      }),
      http.post(`${API}/sessions`, async ({ request }) => {
        sessionBody = (await request.json()) as { agent?: unknown };
        return HttpResponse.json({ id: "sesn_deploy", agent: { id: "agent_coord", version: 11 } });
      })
    );

    const report = await deployBrain(client(), freshInput(), true);

    expect(report.subAgents.map((s) => [s.id, s.toVersion])).toEqual([
      ["agent_a", 4],
      ["agent_b", 6]
    ]);
    expect(report.coordinator.toVersion).toBe(11);
    expect(report.coordinator.repinned).toEqual([
      { id: "agent_a", version: 4 },
      { id: "agent_b", version: 6 }
    ]);
    // The coordinator update actually carried the re-pinned roster (A bumped to 4).
    expect(coordBody?.multiagent?.agents).toEqual([
      { id: "agent_a", type: "agent", version: 4 },
      { id: "agent_b", type: "agent", version: 6 }
    ]);
    // The session runs on the coordinator (its latest version).
    expect(sessionBody?.agent).toBe("agent_coord");
    expect(report.session).toEqual({ created: true, sessionId: "sesn_deploy", agentVersion: 11 });
  });
});
