import { describe, it, expect } from "vitest";
import {
  webhookEnvelopeSchema,
  normaliseInbound,
  messageText,
  replyChatId
} from "./whatsappPayload";

function normalise(payload: unknown) {
  const parsed = webhookEnvelopeSchema.parse(payload);
  return normaliseInbound(parsed);
}

describe("whatsappPayload", () => {
  it("normalises a flat message payload", () => {
    const { event, message } = normalise({ chatId: "c1", body: "hi", type: "text" });
    expect(event).toBeUndefined();
    expect(messageText(message)).toBe("hi");
    expect(replyChatId(message)).toBe("c1");
  });

  it("normalises a wrapped {event,data} envelope", () => {
    const { event, message } = normalise({
      event: "message.received",
      session: "inigo-coach",
      data: { chatId: "c2", body: "yo" }
    });
    expect(event).toBe("message.received");
    expect(replyChatId(message)).toBe("c2");
  });

  it("prefers body over text, and chatId over from", () => {
    expect(messageText({ body: "b", text: "t" })).toBe("b");
    expect(messageText({ text: "t" })).toBe("t");
    expect(replyChatId({ chatId: "c", from: "f" })).toBe("c");
    expect(replyChatId({ from: "f" })).toBe("f");
  });
});
