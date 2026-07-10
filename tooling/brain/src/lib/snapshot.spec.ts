import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createBrainClient } from "../client";
import { collectSnapshot } from "./snapshot";

const API = "https://api.anthropic.com/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function page(data: unknown[]) {
  return HttpResponse.json({ data, next_page: null });
}

// No `/sessions` handler: collectSnapshot must not fetch sessions (ephemeral runtime,
// not versioned). `onUnhandledRequest: "error"` fails the test if it ever does.
const lists = [
  http.get(`${API}/agents`, () => page([{ id: "agent_1", name: "Coach", version: 3 }])),
  http.get(`${API}/environments`, () => page([{ id: "env_1" }])),
  http.get(`${API}/vaults`, () => page([{ id: "vlt_1", display_name: "Vault" }])),
  http.get(`${API}/memory_stores`, () => page([{ id: "memstore_1", name: "Mem" }])),
  http.get(`${API}/skills`, () => page([{ id: "skill_1", display_title: "S" }]))
];

describe("collectSnapshot", () => {
  it("aggregates every resource and fetches the target agent config (no versions, no sessions)", async () => {
    // No `/agents/agent_1/versions` handler either: version history is not collected.
    server.use(
      ...lists,
      http.get(`${API}/agents/agent_1`, () =>
        HttpResponse.json({ id: "agent_1", name: "Coach", version: 3, system: "tu es un coach" })
      )
    );

    const snapshot = await collectSnapshot(createBrainClient("sk-ant-test", { maxRetries: 0 }), {
      agentId: "agent_1"
    });

    expect(snapshot.agents).toHaveLength(1);
    expect(snapshot.environments).toHaveLength(1);
    expect(snapshot.vaults).toHaveLength(1);
    expect(snapshot.memoryStores).toHaveLength(1);
    expect(snapshot.skills).toHaveLength(1);
    expect(snapshot.agentDetails).toHaveLength(1);
    expect(snapshot.agentDetails[0]?.config).toMatchObject({ id: "agent_1", version: 3 });
    expect(snapshot.agentDetails[0]).not.toHaveProperty("versions");
    expect(snapshot.errors).toHaveLength(0);
  });

  it("follows the multiagent roster and pulls each sub-agent in full", async () => {
    server.use(
      ...lists,
      http.get(`${API}/agents/agent_1`, () =>
        HttpResponse.json({
          id: "agent_1",
          name: "Coach",
          version: 3,
          multiagent: {
            type: "coordinator",
            agents: [
              { id: "agent_sub_a", type: "agent", version: 2 },
              { id: "agent_sub_b", type: "agent", version: 1 }
            ]
          }
        })
      ),
      http.get(`${API}/agents/agent_sub_a`, () =>
        HttpResponse.json({ id: "agent_sub_a", name: "Sub A", version: 2 })
      ),
      http.get(`${API}/agents/agent_sub_b`, () =>
        HttpResponse.json({ id: "agent_sub_b", name: "Sub B", version: 1 })
      )
    );

    const snapshot = await collectSnapshot(createBrainClient("sk-ant-test", { maxRetries: 0 }), {
      agentId: "agent_1"
    });

    const ids = snapshot.agentDetails.map((d) => d.id).sort();
    expect(ids).toEqual(["agent_1", "agent_sub_a", "agent_sub_b"]);
    expect(snapshot.errors).toHaveLength(0);
  });

  it("captures per-resource failures without aborting the whole snapshot", async () => {
    server.use(
      http.get(`${API}/agents`, () => page([])),
      http.get(`${API}/environments`, () => page([])),
      http.get(`${API}/vaults`, () => HttpResponse.json({ error: "boom" }, { status: 500 })),
      http.get(`${API}/memory_stores`, () => page([])),
      http.get(`${API}/skills`, () => page([]))
    );

    const snapshot = await collectSnapshot(createBrainClient("sk-ant-test", { maxRetries: 0 }));

    expect(snapshot.errors.some((e) => e.resource === "vaults")).toBe(true);
    // Other resources still collected.
    expect(snapshot.agents).toHaveLength(0);
    expect(snapshot.skills).toHaveLength(0);
  });
});
