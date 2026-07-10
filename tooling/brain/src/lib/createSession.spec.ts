import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createBrainClient } from "../client";
import { createSession } from "./createSession";

const API = "https://api.anthropic.com/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => createBrainClient("sk-ant-test", { maxRetries: 0 });

const input = {
  agentId: "agent_coord",
  environmentId: "env_1",
  vaultIds: ["vlt_1"],
  resources: [{ type: "memory_store" as const, memory_store_id: "memstore_1", access: "read_only" as const }]
};

describe("createSession", () => {
  it("does not call the API in dry-run and returns the params it would send", async () => {
    // No handlers registered: onUnhandledRequest "error" would throw if a request fired.
    const result = await createSession(client(), input, false);
    expect(result.created).toBe(false);
    expect(result.sessionId).toBeUndefined();
    expect(result.params).toMatchObject({
      agent: "agent_coord",
      environment_id: "env_1",
      vault_ids: ["vlt_1"],
      resources: [{ type: "memory_store", memory_store_id: "memstore_1", access: "read_only" }]
    });
  });

  it("creates the session and returns its id + captured agent version when applied", async () => {
    let sentBody: unknown = null;
    server.use(
      http.post(`${API}/sessions`, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ id: "sesn_new", agent: { id: "agent_coord", version: 13 } });
      })
    );

    const result = await createSession(client(), input, true);
    expect(result.created).toBe(true);
    expect(result.sessionId).toBe("sesn_new");
    expect(result.agentVersion).toBe(13);
    expect(sentBody).toMatchObject({
      agent: "agent_coord",
      environment_id: "env_1",
      vault_ids: ["vlt_1"],
      resources: [{ type: "memory_store", memory_store_id: "memstore_1", access: "read_only" }]
    });
  });
});
