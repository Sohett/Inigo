import { describe, it, expect, vi } from "vitest";
import { createRouteInboundMessage } from "./routeInboundMessage";
import type { Athlete } from "../domain/athlete";
import type { AthleteRepository } from "../repositories/athleteRepository";

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: "a-1",
    displayName: "Thomas",
    phoneNum: "+32475123456",
    chatId: "32475123456@c.us",
    status: "active",
    anthropicSessionId: "sesn_abc",
    managedAgentId: "agent_abc",
    ...overrides
  };
}

function makeDeps(athlete: Athlete | null) {
  const appendUserMessage = vi.fn(() => Promise.resolve());
  const findByPhone = vi.fn((_phone: string) => Promise.resolve(athlete));
  const setChatId = vi.fn(() => Promise.resolve());
  const repo: AthleteRepository = { findByPhone, setChatId };
  return { deps: { repo, brain: { appendUserMessage } }, appendUserMessage, findByPhone, setChatId };
}

// A plausible inbound text from an athlete whose stored phone is +32475123456.
const inbound = { from: "32475123456@c.us", body: "salut", type: "text" };

describe("routeInboundMessage", () => {
  it("forwards a known athlete's message to their resolved session", async () => {
    const { deps, appendUserMessage, findByPhone, setChatId } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(findByPhone).toHaveBeenCalledWith("+32475123456");
    expect(appendUserMessage).toHaveBeenCalledWith("sesn_abc", "chat_id: 32475123456@c.us\nmessage: salut");
    expect(outcome).toEqual({
      status: "forwarded",
      athleteId: "a-1",
      sessionId: "sesn_abc",
      chatId: "32475123456@c.us"
    });
    // chat id already matches → no write.
    expect(setChatId).not.toHaveBeenCalled();
  });

  it("persists chat_id on first contact (stored chat id is null)", async () => {
    const { deps, appendUserMessage, setChatId } = makeDeps(makeAthlete({ chatId: null }));
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(setChatId).toHaveBeenCalledWith("a-1", "32475123456@c.us");
    expect(appendUserMessage).toHaveBeenCalledOnce();
    expect(outcome.status).toBe("forwarded");
  });

  it("updates chat_id when the stored one differs (athlete changed chat)", async () => {
    const { deps, setChatId } = makeDeps(makeAthlete({ chatId: "999@c.us" }));
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(setChatId).toHaveBeenCalledWith("a-1", "32475123456@c.us");
    expect(outcome.status).toBe("forwarded");
  });

  it("forwards a wrapped {event,data} envelope", async () => {
    const { deps, appendUserMessage } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute({
      event: "message.received",
      data: { from: "32475123456@c.us", body: "yo" }
    });

    expect(outcome.status).toBe("forwarded");
    expect(appendUserMessage).toHaveBeenCalledWith("sesn_abc", "chat_id: 32475123456@c.us\nmessage: yo");
  });

  it("ignores a known number that has no session yet", async () => {
    const { deps, appendUserMessage, setChatId } = makeDeps(makeAthlete({ anthropicSessionId: null }));
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(outcome).toEqual({ status: "ignored", reason: "no_session" });
    expect(appendUserMessage).not.toHaveBeenCalled();
    expect(setChatId).not.toHaveBeenCalled();
  });

  it("ignores an unknown number", async () => {
    const { deps, appendUserMessage } = makeDeps(null);
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(outcome).toEqual({ status: "ignored", reason: "unknown_number" });
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("ignores an unparseable sender without hitting the repo", async () => {
    const { deps, findByPhone } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute({ chatId: "status@broadcast", body: "x" });

    expect(outcome).toEqual({ status: "ignored", reason: "invalid_sender" });
    expect(findByPhone).not.toHaveBeenCalled();
  });

  it("ignores outbound (fromMe) messages", async () => {
    const { deps, findByPhone } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute({ ...inbound, fromMe: true });
    expect(outcome).toEqual({ status: "ignored", reason: "outbound" });
    expect(findByPhone).not.toHaveBeenCalled();
  });

  it("ignores group messages", async () => {
    const { deps } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute({ ...inbound, isGroup: true });
    expect(outcome).toEqual({ status: "ignored", reason: "group" });
  });

  it("ignores messages with no text", async () => {
    const { deps } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute({ from: "32475123456@c.us", type: "image" });
    expect(outcome).toEqual({ status: "ignored", reason: "no_text" });
  });

  it("ignores non-message events", async () => {
    const { deps } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute({
      event: "message.ack",
      data: { chatId: "32475123456@c.us", body: "hi" }
    });
    expect(outcome).toEqual({ status: "ignored", reason: "unhandled_event" });
  });

  it("ignores a payload that does not match the webhook schema", async () => {
    const { deps } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute(null);
    expect(outcome).toEqual({ status: "ignored", reason: "malformed_payload" });
  });

  it("propagates repository failures (infra → 502 upstream)", async () => {
    const findByPhone = vi.fn(() => Promise.reject(new Error("neon down")));
    const appendUserMessage = vi.fn(() => Promise.resolve());
    const deps = { repo: { findByPhone, setChatId: vi.fn(() => Promise.resolve()) }, brain: { appendUserMessage } };
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("neon down");
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("propagates a setChatId failure without appending (infra → 502 upstream)", async () => {
    const appendUserMessage = vi.fn(() => Promise.resolve());
    const setChatId = vi.fn(() => Promise.reject(new Error("neon down")));
    const deps = {
      repo: { findByPhone: vi.fn(() => Promise.resolve(makeAthlete({ chatId: null }))), setChatId },
      brain: { appendUserMessage }
    };
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("neon down");
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("propagates brain failures (infra → 502 upstream)", async () => {
    const appendUserMessage = vi.fn(() => Promise.reject(new Error("anthropic 500")));
    const deps = {
      repo: { findByPhone: vi.fn(() => Promise.resolve(makeAthlete())), setChatId: vi.fn(() => Promise.resolve()) },
      brain: { appendUserMessage }
    };
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("anthropic 500");
  });
});
