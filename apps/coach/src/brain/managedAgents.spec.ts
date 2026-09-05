import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createManagedAgentBrain } from "./managedAgents";

describe("createManagedAgentBrain", () => {
  it("sends a user.message event to the given session", async () => {
    const send = vi.fn(() => Promise.resolve({}));
    const anthropic = { beta: { sessions: { events: { send } } } } as unknown as Anthropic;

    const brain = createManagedAgentBrain(anthropic);
    await brain.appendUserMessage("sesn_123", "hello coach");

    expect(send).toHaveBeenCalledWith("sesn_123", {
      events: [{ type: "user.message", content: [{ type: "text", text: "hello coach" }] }]
    });
  });

  it("creates a session with the template elements and returns the captured agent version", async () => {
    const create = vi.fn(() => Promise.resolve({ id: "sesn_new", agent: { id: "agent_x", version: 16 } }));
    const anthropic = { beta: { sessions: { create } } } as unknown as Anthropic;

    const brain = createManagedAgentBrain(anthropic);
    const created = await brain.createSession({
      agentId: "agent_x",
      environmentId: "env_1",
      vaultIds: ["vlt_1"],
      resources: [{ type: "memory_store", memory_store_id: "memstore_1", access: "read_only" }],
      title: "Inigo · Thomas · 2026-09-05"
    });

    expect(create).toHaveBeenCalledWith({
      agent: "agent_x",
      environment_id: "env_1",
      vault_ids: ["vlt_1"],
      resources: [{ type: "memory_store", memory_store_id: "memstore_1", access: "read_only" }],
      title: "Inigo · Thomas · 2026-09-05"
    });
    expect(created).toEqual({ sessionId: "sesn_new", agentVersion: 16 });
  });

  it("omits the optional elements when the template has none", async () => {
    const create = vi.fn(() => Promise.resolve({ id: "sesn_min", agent: { id: "agent_x", version: 1 } }));
    const anthropic = { beta: { sessions: { create } } } as unknown as Anthropic;

    await createManagedAgentBrain(anthropic).createSession({
      agentId: "agent_x",
      environmentId: "env_1"
    });

    expect(create).toHaveBeenCalledWith({ agent: "agent_x", environment_id: "env_1" });
  });
});
