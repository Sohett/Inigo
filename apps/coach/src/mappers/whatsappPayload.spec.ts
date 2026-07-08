import { describe, it, expect } from "vitest";
import {
  webhookEnvelopeSchema,
  normaliseInbound,
  messageText,
  replyChatId,
  senderPhone
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
      session: "coach",
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

  describe("senderPhone", () => {
    it("parses a standard WhatsApp JID to E.164", () => {
      expect(senderPhone({ from: "32475123456@c.us" })).toBe("+32475123456");
    });

    it("strips a multi-device suffix", () => {
      expect(senderPhone({ from: "32475123456:12@c.us" })).toBe("+32475123456");
    });

    it("falls back to chatId when from is absent", () => {
      expect(senderPhone({ chatId: "32475123456@c.us" })).toBe("+32475123456");
    });

    it("keeps a single leading plus (idempotent-ish on already-E.164)", () => {
      expect(senderPhone({ from: "+32475123456" })).toBe("+32475123456");
    });

    it("returns null for group JIDs", () => {
      expect(senderPhone({ from: "120363000000000000@g.us", isGroup: true })).toBeNull();
    });

    it("returns null when no digits remain", () => {
      expect(senderPhone({ from: "status@broadcast" })).toBeNull();
    });

    it("returns null when there is no sender at all", () => {
      expect(senderPhone({ body: "hi" })).toBeNull();
    });
  });
});
