import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRouteInboundMessage, formatTurn, formatDateDuJour } from "./routeInboundMessage";
import type { Athlete } from "../domain/athlete";
import type { AthleteRepository } from "../repositories/athleteRepository";

// A fixed instant so the `date_du_jour` the envelope carries is deterministic. In
// Europe/Brussels (the default routing timezone) this is Thursday 2026-07-09.
const FIXED_NOW = new Date("2026-07-09T09:05:56Z");
const DATE_LINE = "date_du_jour: 2026-07-09 (jeudi)";

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: "a-1",
    displayName: "Thomas",
    phoneNum: "+32475123456",
    whatsappLid: null,
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
  const findByLid = vi.fn((_lid: string) => Promise.resolve(athlete));
  const setChatId = vi.fn(() => Promise.resolve());
  const repo: AthleteRepository = { findByPhone, findByLid, setChatId };
  return { deps: { repo, brain: { appendUserMessage } }, appendUserMessage, findByPhone, findByLid, setChatId };
}

// A plausible inbound text from an athlete whose stored phone is +32475123456.
const inbound = { from: "32475123456@c.us", body: "salut", type: "text" };
// The same athlete arriving via WhatsApp LID addressing (no phone in the payload).
const lidInbound = { from: "10325252415590@lid", chatId: "10325252415590@lid", body: "ok", type: "text", isLidSender: true };

describe("routeInboundMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards a known athlete's message to their resolved session", async () => {
    const { deps, appendUserMessage, findByPhone, setChatId } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(findByPhone).toHaveBeenCalledWith("+32475123456");
    expect(appendUserMessage).toHaveBeenCalledWith(
      "sesn_abc",
      `${DATE_LINE}\ninigo_athlete_id: a-1\nchat_id: 32475123456@c.us\nmessage: salut`
    );
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
    expect(appendUserMessage).toHaveBeenCalledWith(
      "sesn_abc",
      `${DATE_LINE}\ninigo_athlete_id: a-1\nchat_id: 32475123456@c.us\nmessage: yo`
    );
  });

  it("forwards a LID sender to their session, resolved by LID not phone", async () => {
    const athlete = makeAthlete({ whatsappLid: "10325252415590@lid", chatId: "10325252415590@lid" });
    const { deps, appendUserMessage, findByLid, findByPhone } = makeDeps(athlete);
    const outcome = await createRouteInboundMessage(deps).execute(lidInbound);

    expect(findByLid).toHaveBeenCalledWith("10325252415590@lid");
    expect(findByPhone).not.toHaveBeenCalled();
    expect(appendUserMessage).toHaveBeenCalledWith(
      "sesn_abc",
      `${DATE_LINE}\ninigo_athlete_id: a-1\nchat_id: 10325252415590@lid\nmessage: ok`
    );
    expect(outcome).toEqual({
      status: "forwarded",
      athleteId: "a-1",
      sessionId: "sesn_abc",
      chatId: "10325252415590@lid"
    });
  });

  it("ignores a LID sender that matches no athlete", async () => {
    const { deps, findByLid, findByPhone } = makeDeps(null);
    const outcome = await createRouteInboundMessage(deps).execute(lidInbound);

    expect(findByLid).toHaveBeenCalledWith("10325252415590@lid");
    expect(findByPhone).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "ignored", reason: "unknown_number" });
  });

  it("resolves a phone sender via findByPhone, never findByLid", async () => {
    const { deps, findByLid, findByPhone } = makeDeps(makeAthlete());
    await createRouteInboundMessage(deps).execute(inbound);

    expect(findByPhone).toHaveBeenCalledWith("+32475123456");
    expect(findByLid).not.toHaveBeenCalled();
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
    const findByLid = vi.fn(() => Promise.resolve(null));
    const appendUserMessage = vi.fn(() => Promise.resolve());
    const deps = {
      repo: { findByPhone, findByLid, setChatId: vi.fn(() => Promise.resolve()) },
      brain: { appendUserMessage }
    };
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("neon down");
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("propagates a setChatId failure without appending (infra → 502 upstream)", async () => {
    const appendUserMessage = vi.fn(() => Promise.resolve());
    const setChatId = vi.fn(() => Promise.reject(new Error("neon down")));
    const deps = {
      repo: {
        findByPhone: vi.fn(() => Promise.resolve(makeAthlete({ chatId: null }))),
        findByLid: vi.fn(() => Promise.resolve(null)),
        setChatId
      },
      brain: { appendUserMessage }
    };
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("neon down");
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("propagates brain failures (infra → 502 upstream)", async () => {
    const appendUserMessage = vi.fn(() => Promise.reject(new Error("anthropic 500")));
    const deps = {
      repo: {
        findByPhone: vi.fn(() => Promise.resolve(makeAthlete())),
        findByLid: vi.fn(() => Promise.resolve(null)),
        setChatId: vi.fn(() => Promise.resolve())
      },
      brain: { appendUserMessage }
    };
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("anthropic 500");
  });
});

describe("formatDateDuJour", () => {
  it("renders YYYY-MM-DD with the French weekday in the given timezone", () => {
    expect(formatDateDuJour(FIXED_NOW, "Europe/Brussels")).toBe("2026-07-09 (jeudi)");
  });

  it("rolls the day at the athlete's local midnight, not UTC's", () => {
    // Same instant, two timezones: it is already the 10th in Auckland but still the 9th in LA.
    const instant = new Date("2026-07-09T22:30:00Z");
    expect(formatDateDuJour(instant, "Pacific/Auckland")).toBe("2026-07-10 (vendredi)");
    expect(formatDateDuJour(instant, "America/Los_Angeles")).toBe("2026-07-09 (jeudi)");
  });

  it("defaults to Europe/Brussels when no timezone is given", () => {
    // 23:30 UTC is already past midnight in Brussels (UTC+2 in summer).
    expect(formatDateDuJour(new Date("2026-07-09T23:30:00Z"))).toBe("2026-07-10 (vendredi)");
  });
});

describe("formatTurn", () => {
  it("prepends date_du_jour ahead of the athlete id, chat id and message", () => {
    expect(formatTurn("a-1", "32475123456@c.us", "salut", FIXED_NOW, "Europe/Brussels")).toBe(
      "date_du_jour: 2026-07-09 (jeudi)\ninigo_athlete_id: a-1\nchat_id: 32475123456@c.us\nmessage: salut"
    );
  });
});
