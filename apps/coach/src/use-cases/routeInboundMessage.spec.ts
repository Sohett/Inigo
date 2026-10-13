import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRouteInboundMessage } from "./routeInboundMessage";
import type { Athlete } from "../domain/athlete";
import { ONBOARDING_ITEMS, type OnboardingState } from "../domain/onboarding";
import type { AthleteRepository } from "../repositories/athleteRepository";
import type { HandOffOutcome } from "./handOffToCoordinator";

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
    activeSession: { sessionId: "sesn_abc", agentId: "agent_abc" },
    ...overrides
  };
}

/**
 * Port members this use-case never touches, filled in so the fakes still satisfy the
 * interfaces. They exist for the admin path (see `startAthleteSession`).
 */
const unusedRepoMethods = () => ({
  findById: vi.fn(() => Promise.resolve(null)),
  listAll: vi.fn(() => Promise.resolve([])),
  setSession: vi.fn(() => Promise.resolve()),
  listSessions: vi.fn(() => Promise.resolve([])),
  registerOnboardingAthlete: vi.fn(() => Promise.resolve(null)),
  completeOnboarding: vi.fn(() => Promise.resolve())
});
const ONBOARDING_STATE: OnboardingState = {
  done: ["motivation"],
  missing: ["goal"],
  complete: false
};
/** The onboarding assessment, tested in its own spec: here only what it puts in the turn matters. */
const fakeAssess = () => ({
  execute: vi.fn(() => Promise.resolve({ status: "assessed" as const, state: ONBOARDING_STATE }))
});
/** Registration of unknown senders, tested in its own spec: here only the hand-off matters. */
const fakeRegister = () => ({
  execute: vi.fn(() => Promise.resolve({ status: "declined" as const }))
});
/** The hand-off, tested in its own spec: here only where the message goes matters. */
const fakeHandOff = () => ({
  execute: vi.fn(
    (): Promise<HandOffOutcome> => Promise.resolve({ status: "handed_off", sessionId: "sesn_coordinator" })
  )
});
const unusedBrainMethods = () => ({
  createSession: vi.fn(() => Promise.resolve({ sessionId: "sesn_unused", agentVersion: 1 })),
  readSession: vi.fn(),
  listInventory: vi.fn()
});

function makeDeps(athlete: Athlete | null) {
  const appendUserMessage = vi.fn(() => Promise.resolve());
  const findByPhone = vi.fn((_phone: string) => Promise.resolve(athlete));
  const findByLid = vi.fn((_lid: string) => Promise.resolve(athlete));
  const setChatId = vi.fn(() => Promise.resolve());
  const repo: AthleteRepository = { findByPhone, findByLid, setChatId, ...unusedRepoMethods() };
  const register = fakeRegister();
  const assessOnboarding = fakeAssess();
  const handOff = fakeHandOff();
  return {
    deps: { repo, brain: { appendUserMessage, ...unusedBrainMethods() }, register, assessOnboarding, handOff },
    register,
    assessOnboarding,
    handOff,
    appendUserMessage,
    findByPhone,
    findByLid,
    setChatId
  };
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
      `${DATE_LINE}\ninigo_athlete_id: a-1\nmessage: salut`
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
      `${DATE_LINE}\ninigo_athlete_id: a-1\nmessage: yo`
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
      `${DATE_LINE}\ninigo_athlete_id: a-1\nmessage: ok`
    );
    expect(outcome).toEqual({
      status: "forwarded",
      athleteId: "a-1",
      sessionId: "sesn_abc",
      chatId: "10325252415590@lid"
    });
  });

  it("hands a LID sender that matches no athlete to registration, without a phone", async () => {
    const { deps, findByLid, findByPhone, register } = makeDeps(null);
    const outcome = await createRouteInboundMessage(deps).execute(lidInbound);

    expect(findByLid).toHaveBeenCalledWith("10325252415590@lid");
    expect(findByPhone).not.toHaveBeenCalled();
    expect(register.execute).toHaveBeenCalledWith({
      phoneNum: null,
      whatsappLid: "10325252415590@lid",
      chatId: "10325252415590@lid",
      text: "ok"
    });
    expect(outcome).toEqual({ status: "unknown_sender", registration: { status: "declined" } });
  });

  it("resolves a phone sender via findByPhone, never findByLid", async () => {
    const { deps, findByLid, findByPhone } = makeDeps(makeAthlete());
    await createRouteInboundMessage(deps).execute(inbound);

    expect(findByPhone).toHaveBeenCalledWith("+32475123456");
    expect(findByLid).not.toHaveBeenCalled();
  });

  it("ignores a known number that has no session yet", async () => {
    const { deps, appendUserMessage, setChatId } = makeDeps(makeAthlete({ activeSession: null }));
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(outcome).toEqual({ status: "ignored", reason: "no_session" });
    expect(appendUserMessage).not.toHaveBeenCalled();
    expect(setChatId).not.toHaveBeenCalled();
  });

  it("hands an unknown number to registration and forwards nothing itself", async () => {
    const { deps, appendUserMessage, register } = makeDeps(null);
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(register.execute).toHaveBeenCalledWith({
      phoneNum: "+32475123456",
      whatsappLid: null,
      chatId: "32475123456@c.us",
      text: "salut"
    });
    expect(outcome).toEqual({ status: "unknown_sender", registration: { status: "declined" } });
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("gives an athlete in onboarding their checklist with the message", async () => {
    const { deps, appendUserMessage, assessOnboarding, handOff } = makeDeps(makeAthlete({ status: "onboarding" }));
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(assessOnboarding.execute).toHaveBeenCalledWith("a-1");
    expect(handOff.execute).not.toHaveBeenCalled();
    expect(appendUserMessage).toHaveBeenCalledWith(
      "sesn_abc",
      `${DATE_LINE}\ninigo_athlete_id: a-1\nonboarding_fait: motivation\nonboarding_manquant: goal\nmessage: salut`
    );
    expect(outcome.status).toBe("forwarded");
  });

  it("hands an athlete whose onboarding is complete to the coordinator, with the hand-off line", async () => {
    const { deps, appendUserMessage, assessOnboarding, handOff } = makeDeps(makeAthlete({ status: "onboarding" }));
    assessOnboarding.execute.mockResolvedValueOnce({
      status: "assessed",
      state: { done: [...ONBOARDING_ITEMS], missing: [], complete: true }
    });
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(handOff.execute).toHaveBeenCalledWith(makeAthlete({ status: "onboarding" }));
    expect(appendUserMessage).toHaveBeenCalledOnce();
    expect(appendUserMessage).toHaveBeenCalledWith(
      "sesn_coordinator",
      `${DATE_LINE}\ninigo_athlete_id: a-1\npassation: onboarding terminé, planifie la semaine 1\nmessage: salut`
    );
    expect(outcome).toEqual({
      status: "handed_off",
      athleteId: "a-1",
      sessionId: "sesn_coordinator",
      chatId: "32475123456@c.us"
    });
  });

  it("keeps a complete athlete on their onboarding session when no coordinator can take them", async () => {
    const { deps, appendUserMessage, assessOnboarding, handOff } = makeDeps(makeAthlete({ status: "onboarding" }));
    assessOnboarding.execute.mockResolvedValueOnce({
      status: "assessed",
      state: { done: [...ONBOARDING_ITEMS], missing: [], complete: true }
    });
    handOff.execute.mockResolvedValueOnce({ status: "not_configured", reason: "no coordinator agent set" });
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(appendUserMessage).toHaveBeenCalledWith("sesn_abc", expect.stringContaining("onboarding_manquant: \n"));
    expect(outcome).toEqual({
      status: "handoff_not_configured",
      athleteId: "a-1",
      sessionId: "sesn_abc",
      chatId: "32475123456@c.us",
      reason: "no coordinator agent set"
    });
  });

  it("forwards nothing when the hand-off fails (infra → 502 upstream)", async () => {
    const { deps, appendUserMessage, assessOnboarding, handOff } = makeDeps(makeAthlete({ status: "onboarding" }));
    assessOnboarding.execute.mockResolvedValueOnce({
      status: "assessed",
      state: { done: [...ONBOARDING_ITEMS], missing: [], complete: true }
    });
    handOff.execute.mockRejectedValueOnce(new Error("anthropic 500"));
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("anthropic 500");
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it.each(["active", "paused"] as const)("forwards a %s athlete without any checklist", async (status) => {
    const { deps, appendUserMessage, assessOnboarding } = makeDeps(makeAthlete({ status }));
    await createRouteInboundMessage(deps).execute(inbound);

    expect(assessOnboarding.execute).not.toHaveBeenCalled();
    expect(appendUserMessage).toHaveBeenCalledWith(
      "sesn_abc",
      `${DATE_LINE}\ninigo_athlete_id: a-1\nmessage: salut`
    );
  });

  it("ignores an ended athlete without touching anything", async () => {
    const { deps, appendUserMessage, setChatId } = makeDeps(makeAthlete({ status: "ended", chatId: null }));
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(outcome).toEqual({ status: "ignored", reason: "athlete_ended" });
    expect(appendUserMessage).not.toHaveBeenCalled();
    expect(setChatId).not.toHaveBeenCalled();
  });

  it("forwards nothing when the onboarding assessment fails (infra → 502 upstream)", async () => {
    const { deps, appendUserMessage, setChatId, assessOnboarding } = makeDeps(
      makeAthlete({ status: "onboarding", chatId: null })
    );
    assessOnboarding.execute.mockRejectedValueOnce(new Error("intervals down"));
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("intervals down");
    expect(setChatId).not.toHaveBeenCalled();
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("never registers a known athlete again", async () => {
    const { deps, register } = makeDeps(makeAthlete());
    await createRouteInboundMessage(deps).execute(inbound);
    expect(register.execute).not.toHaveBeenCalled();
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
      repo: { findByPhone, findByLid, setChatId: vi.fn(() => Promise.resolve()), ...unusedRepoMethods() },
      brain: { appendUserMessage, ...unusedBrainMethods() },
      register: fakeRegister(),
      assessOnboarding: fakeAssess(),
      handOff: fakeHandOff()
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
        setChatId,
        ...unusedRepoMethods()
      },
      brain: { appendUserMessage, ...unusedBrainMethods() },
      register: fakeRegister(),
      assessOnboarding: fakeAssess(),
      handOff: fakeHandOff()
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
        setChatId: vi.fn(() => Promise.resolve()),
        ...unusedRepoMethods()
      },
      brain: { appendUserMessage, ...unusedBrainMethods() },
      register: fakeRegister(),
      assessOnboarding: fakeAssess(),
      handOff: fakeHandOff()
    };
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("anthropic 500");
  });

  /**
   * Identification against payloads as OpenWA really delivers them (whatsapp-web.js engine). The
   * LID one is the production delivery from INI-20, verbatim; the others keep its exact shape.
   */
  describe("identification from real OpenWA payloads", () => {
    const LID_DELIVERY = {
      event: "message.received",
      timestamp: "2026-07-09T07:48:41.777Z",
      sessionId: "a6ac74ad-fa50-4b7d-a367-5fa573841a75",
      idempotencyKey: "msg_a6ac74ad-fa50-4b7d-a367-5fa573841a75_false_10325252415590@lid_3B09F11BD6042A8B69B0",
      deliveryId: "dlv_b3724cb7-eaab-4edb-904b-f937fb5e476b",
      data: {
        id: "false_10325252415590@lid_3B09F11BD6042A8B69B0",
        from: "10325252415590@lid",
        to: "447882748102@c.us",
        chatId: "10325252415590@lid",
        body: "ok",
        type: "text",
        timestamp: 1783583321,
        fromMe: false,
        isGroup: false,
        isStatusBroadcast: false,
        isLidSender: true,
        contact: { pushName: "Thomas Sohet", name: "Thomas" }
      }
    };
    const PHONE_DELIVERY = {
      ...LID_DELIVERY,
      data: {
        ...LID_DELIVERY.data,
        id: "false_32475123456@c.us_3B09F11BD6042A8B69B0",
        from: "32475123456@c.us",
        chatId: "32475123456@c.us",
        isLidSender: undefined
      }
    };

    it("identifies a LID sender by their LID only, and replies to that LID chat", async () => {
      const athlete = makeAthlete({ phoneNum: null, whatsappLid: "10325252415590@lid", chatId: "10325252415590@lid" });
      const { deps, findByLid, findByPhone, appendUserMessage } = makeDeps(athlete);
      const outcome = await createRouteInboundMessage(deps).execute(LID_DELIVERY);

      expect(findByLid).toHaveBeenCalledWith("10325252415590@lid");
      expect(findByPhone).not.toHaveBeenCalled();
      expect(appendUserMessage).toHaveBeenCalledWith("sesn_abc", `${DATE_LINE}\ninigo_athlete_id: a-1\nmessage: ok`);
      expect(outcome).toMatchObject({ status: "forwarded", chatId: "10325252415590@lid" });
    });

    it("identifies a phone sender by their E.164 number only", async () => {
      const { deps, findByLid, findByPhone } = makeDeps(makeAthlete());
      const outcome = await createRouteInboundMessage(deps).execute(PHONE_DELIVERY);

      expect(findByPhone).toHaveBeenCalledWith("+32475123456");
      expect(findByLid).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ status: "forwarded", chatId: "32475123456@c.us" });
    });

    it("ignores the senderPhone OpenWA can attach to a LID sender (RESOLVE_LID_TO_PHONE)", async () => {
      const { deps, findByLid, findByPhone } = makeDeps(makeAthlete({ whatsappLid: "10325252415590@lid" }));
      await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        data: { ...LID_DELIVERY.data, senderPhone: "32475123456" }
      });

      expect(findByLid).toHaveBeenCalledWith("10325252415590@lid");
      expect(findByPhone).not.toHaveBeenCalled();
    });

    it("treats an athlete known by phone only as unknown when they write from a LID (known limit)", async () => {
      const { deps, findByLid, findByPhone, register } = makeDeps(makeAthlete({ whatsappLid: null }));
      findByLid.mockResolvedValueOnce(null);
      const outcome = await createRouteInboundMessage(deps).execute(LID_DELIVERY);

      expect(findByPhone).not.toHaveBeenCalled();
      expect(register.execute).toHaveBeenCalledWith({
        phoneNum: null,
        whatsappLid: "10325252415590@lid",
        chatId: "10325252415590@lid",
        text: "ok"
      });
      expect(outcome.status).toBe("unknown_sender");
    });

    it("never identifies anyone from the account's own sends (message.sent)", async () => {
      const { deps, findByLid, findByPhone } = makeDeps(makeAthlete());
      const outcome = await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        event: "message.sent",
        data: { ...LID_DELIVERY.data, from: "447882748102@c.us", to: "243735870890225@lid", fromMe: true }
      });

      expect(outcome).toEqual({ status: "ignored", reason: "unhandled_event" });
      expect(findByLid).not.toHaveBeenCalled();
      expect(findByPhone).not.toHaveBeenCalled();
    });

    it("never takes a status poster's author for the sender", async () => {
      const { deps, findByLid, findByPhone } = makeDeps(makeAthlete());
      const outcome = await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        data: {
          ...LID_DELIVERY.data,
          from: "status@broadcast",
          chatId: "status@broadcast",
          author: "32475123456@c.us",
          isStatusBroadcast: true,
          isLidSender: undefined
        }
      });

      expect(outcome).toEqual({ status: "ignored", reason: "invalid_sender" });
      expect(findByLid).not.toHaveBeenCalled();
      expect(findByPhone).not.toHaveBeenCalled();
    });
  });
});
