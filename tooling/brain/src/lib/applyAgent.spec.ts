import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createBrainClient } from "../client";
import { applyAgent, AgentVersionConflictError } from "./applyAgent";

const API = "https://api.anthropic.com/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => createBrainClient("sk-ant-test", { maxRetries: 0 });

const currentAgent = {
  id: "agent_1",
  version: 3,
  name: "Coach",
  model: "claude-opus-4-8",
  system: "ancien prompt"
};

describe("applyAgent", () => {
  it("computes a diff without writing in dry-run mode", async () => {
    server.use(http.get(`${API}/agents/agent_1`, () => HttpResponse.json(currentAgent)));

    const result = await applyAgent(
      client(),
      { agentId: "agent_1", config: { name: "Coach", system: "nouveau prompt" } },
      false
    );

    expect(result.applied).toBe(false);
    expect(result.plan.currentVersion).toBe(3);
    expect(result.plan.changedFields).toEqual(["system"]);
  });

  it("sends the current version and returns the new one when applied", async () => {
    let sentVersion: unknown = null;
    server.use(
      http.get(`${API}/agents/agent_1`, () => HttpResponse.json(currentAgent)),
      http.post(`${API}/agents/agent_1`, async ({ request }) => {
        sentVersion = ((await request.json()) as { version?: unknown }).version;
        return HttpResponse.json({ ...currentAgent, version: 4, system: "nouveau prompt" });
      })
    );

    const result = await applyAgent(
      client(),
      { agentId: "agent_1", config: { system: "nouveau prompt" } },
      true
    );

    expect(sentVersion).toBe(3); // optimistic concurrency
    expect(result.applied).toBe(true);
    expect(result.newVersion).toBe(4);
  });

  it("maps a 409 to AgentVersionConflictError", async () => {
    server.use(
      http.get(`${API}/agents/agent_1`, () => HttpResponse.json(currentAgent)),
      http.post(`${API}/agents/agent_1`, () =>
        HttpResponse.json({ error: "version conflict" }, { status: 409 })
      )
    );

    await expect(
      applyAgent(client(), { agentId: "agent_1", config: { system: "x" } }, true)
    ).rejects.toBeInstanceOf(AgentVersionConflictError);
  });
});
