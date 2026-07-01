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
});
