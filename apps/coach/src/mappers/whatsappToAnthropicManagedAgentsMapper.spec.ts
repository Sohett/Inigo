import { describe, it, expect, vi } from "vitest";
import {
  whatsappToAnthropicManagedAgentsMapper,
  type MapperDeps
} from "./whatsappToAnthropicManagedAgentsMapper";

function makeDeps() {
  const appendUserMessage = vi.fn(() => Promise.resolve());
  const deps: MapperDeps = { brain: { appendUserMessage }, sessionId: "sesn_fixed" };
  return { deps, appendUserMessage };
}

describe("whatsappToAnthropicManagedAgentsMapper", () => {
  it("forwards a flat text message, embedding the chatId", async () => {
    const { deps, appendUserMessage } = makeDeps();
    const result = await whatsappToAnthropicManagedAgentsMapper(deps, {
      chatId: "628@c.us",
      body: "salut",
      type: "text"
    });

    expect(result).toEqual({ status: "forwarded", chatId: "628@c.us" });
    expect(appendUserMessage).toHaveBeenCalledWith("sesn_fixed", "chat_id: 628@c.us\nmessage: salut");
  });

  it("forwards a wrapped {event,data} envelope", async () => {
    const { deps, appendUserMessage } = makeDeps();
    const result = await whatsappToAnthropicManagedAgentsMapper(deps, {
      event: "message.received",
      data: { chatId: "c2", body: "yo" }
    });
    expect(result.status).toBe("forwarded");
    expect(appendUserMessage).toHaveBeenCalledOnce();
  });

  it("ignores outbound (fromMe) messages", async () => {
    const { deps, appendUserMessage } = makeDeps();
    const result = await whatsappToAnthropicManagedAgentsMapper(deps, {
      chatId: "c1",
      body: "hi",
      fromMe: true
    });
    expect(result.status).toBe("ignored");
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("ignores group messages", async () => {
    const { deps } = makeDeps();
    const result = await whatsappToAnthropicManagedAgentsMapper(deps, {
      chatId: "g1",
      body: "hi",
      isGroup: true
    });
    expect(result.status).toBe("ignored");
  });

  it("ignores non-message events", async () => {
    const { deps } = makeDeps();
    const result = await whatsappToAnthropicManagedAgentsMapper(deps, {
      event: "message.ack",
      data: { chatId: "c1", body: "hi" }
    });
    expect(result.status).toBe("ignored");
  });

  it("ignores messages with no text", async () => {
    const { deps } = makeDeps();
    const result = await whatsappToAnthropicManagedAgentsMapper(deps, { chatId: "c1", type: "image" });
    expect(result.status).toBe("ignored");
  });
});
