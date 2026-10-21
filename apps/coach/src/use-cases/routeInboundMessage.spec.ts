import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRouteInboundMessage } from "./routeInboundMessage";
import type { Athlete, SenderIdentity } from "../domain/athlete";
import { ONBOARDING_ITEMS, type OnboardingState } from "../domain/onboarding";
import type { AthleteRepository } from "../repositories/athleteRepository";
import type { HandOffOutcome } from "./handOffToCoordinator";
import type { RefreshOutcome } from "./refreshAthleteSession";

// A fixed instant so the `date_time` the envelope carries is deterministic. In the test
// athlete's timezone (Europe/Brussels) this is Thursday 2026-07-09, 11:05.
const FIXED_NOW = new Date("2026-07-09T09:05:56Z");
const DATE_LINE = "date_time: 2026-07-09 11:05 (jeudi)";

function makeAthlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: "a-1",
    displayName: "Thomas",
    phoneNum: "+32475123456",
    whatsappLid: null,
    chatId: "32475123456@c.us",
    status: "active",
    timezone: "Europe/Brussels",
    locale: "fr",
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
  replaceSession: vi.fn(() => Promise.resolve(true)),
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
/** The session refresh, tested in its own spec: by default the session is up to date. */
const fakeRefresh = () => ({
  execute: vi.fn(
    (_athlete: Athlete, session: { sessionId: string }): Promise<RefreshOutcome> =>
      Promise.resolve({ status: "current", sessionId: session.sessionId })
  )
});

function makeDeps(athlete: Athlete | null) {
  const appendUserMessage = vi.fn(() => Promise.resolve());
  const findBySender = vi.fn((_sender: SenderIdentity) => Promise.resolve(athlete ? [athlete] : []));
  const rememberSender = vi.fn(() => Promise.resolve());
  const repo: AthleteRepository = { findBySender, rememberSender, ...unusedRepoMethods() };
  const register = fakeRegister();
  const assessOnboarding = fakeAssess();
  const handOff = fakeHandOff();
  const refreshSession = fakeRefresh();
  return {
    deps: { repo, brain: { appendUserMessage }, register, assessOnboarding, handOff, refreshSession },
    register,
    assessOnboarding,
    handOff,
    refreshSession,
    appendUserMessage,
    findBySender,
    rememberSender
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
    const { deps, appendUserMessage, findBySender, rememberSender } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(findBySender).toHaveBeenCalledWith({ phone: "+32475123456", lid: null });
    expect(appendUserMessage).toHaveBeenCalledWith(
      "sesn_abc",
      `${DATE_LINE}\ninigo_athlete_id: a-1\nathlete_display_name: Thomas\nlocale: fr\nmessage: "salut"`
    );
    expect(outcome).toEqual({
      status: "forwarded",
      athleteId: "a-1",
      sessionId: "sesn_abc",
      chatId: "32475123456@c.us"
    });
    // chat id already matches → no write.
    expect(rememberSender).not.toHaveBeenCalled();
  });

  it("persists chat_id on first contact (stored chat id is null)", async () => {
    const { deps, appendUserMessage, rememberSender } = makeDeps(makeAthlete({ chatId: null }));
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(rememberSender).toHaveBeenCalledWith("a-1", { chatId: "32475123456@c.us" });
    expect(appendUserMessage).toHaveBeenCalledOnce();
    expect(outcome.status).toBe("forwarded");
  });

  it("updates chat_id when the stored one differs (athlete changed chat)", async () => {
    const { deps, rememberSender } = makeDeps(makeAthlete({ chatId: "999@c.us" }));
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(rememberSender).toHaveBeenCalledWith("a-1", { chatId: "32475123456@c.us" });
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
      `${DATE_LINE}\ninigo_athlete_id: a-1\nathlete_display_name: Thomas\nlocale: fr\nmessage: "yo"`
    );
  });

  it("forwards a LID sender to their session, resolved by LID not phone", async () => {
    const athlete = makeAthlete({ whatsappLid: "10325252415590@lid", chatId: "10325252415590@lid" });
    const { deps, appendUserMessage, findBySender } = makeDeps(athlete);
    const outcome = await createRouteInboundMessage(deps).execute(lidInbound);

    expect(findBySender).toHaveBeenCalledWith({ phone: null, lid: "10325252415590@lid" });
    expect(appendUserMessage).toHaveBeenCalledWith(
      "sesn_abc",
      `${DATE_LINE}\ninigo_athlete_id: a-1\nathlete_display_name: Thomas\nlocale: fr\nmessage: "ok"`
    );
    expect(outcome).toEqual({
      status: "forwarded",
      athleteId: "a-1",
      sessionId: "sesn_abc",
      chatId: "10325252415590@lid"
    });
  });

  it("hands a LID sender that matches no athlete to registration, without a phone", async () => {
    const { deps, findBySender, register } = makeDeps(null);
    const outcome = await createRouteInboundMessage(deps).execute(lidInbound);

    expect(findBySender).toHaveBeenCalledWith({ phone: null, lid: "10325252415590@lid" });
    expect(register.execute).toHaveBeenCalledWith({
      phoneNum: null,
      whatsappLid: "10325252415590@lid",
      chatId: "10325252415590@lid",
      text: "ok"
    });
    expect(outcome).toEqual({ status: "unknown_sender", registration: { status: "declined" } });
  });

  it("looks a phone sender up by their number only", async () => {
    const { deps, findBySender } = makeDeps(makeAthlete());
    await createRouteInboundMessage(deps).execute(inbound);

    expect(findBySender).toHaveBeenCalledWith({ phone: "+32475123456", lid: null });
  });

  it("ignores a known number that has no session yet", async () => {
    const { deps, appendUserMessage, rememberSender } = makeDeps(makeAthlete({ activeSession: null }));
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(outcome).toEqual({ status: "ignored", reason: "no_session" });
    expect(appendUserMessage).not.toHaveBeenCalled();
    expect(rememberSender).not.toHaveBeenCalled();
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
      `${DATE_LINE}\ninigo_athlete_id: a-1\nathlete_display_name: Thomas\nlocale: fr\nonboarding_fait: motivation\nonboarding_manquant: goal\nmessage: "salut"`
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
      `${DATE_LINE}\ninigo_athlete_id: a-1\nathlete_display_name: Thomas\nlocale: fr\npassation: onboarding terminé, planifie la semaine 1\nmessage: "salut"`
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

  describe("outdated session (INI-27)", () => {
    const MIGRATED: RefreshOutcome = {
      status: "migrated",
      sessionId: "sesn_new",
      previousSessionId: "sesn_abc",
      carryOver: [{ author: "coach", text: "on garde jeudi ?", at: new Date("2026-07-08T17:00:00Z") }]
    };
    const CARRY_OVER_LINE =
      'reprise_conversation: [{"de":"coach","quand":"2026-07-08 19:00 (mercredi)","texte":"on garde jeudi ?"}]';

    it("sends an active athlete's turn to the new session, with the end of the previous conversation", async () => {
      const { deps, appendUserMessage, refreshSession } = makeDeps(makeAthlete());
      refreshSession.execute.mockResolvedValueOnce(MIGRATED);
      const outcome = await createRouteInboundMessage(deps).execute(inbound);

      expect(refreshSession.execute).toHaveBeenCalledWith(makeAthlete(), { sessionId: "sesn_abc", agentId: "agent_abc" });
      expect(appendUserMessage).toHaveBeenCalledWith(
        "sesn_new",
        `${DATE_LINE}\ninigo_athlete_id: a-1\nathlete_display_name: Thomas\nlocale: fr\n${CARRY_OVER_LINE}\nmessage: "salut"`
      );
      expect(outcome).toMatchObject({ status: "forwarded", sessionId: "sesn_new" });
    });

    it("carries the conversation over in an onboarding turn too, after the checklist", async () => {
      const { deps, appendUserMessage, refreshSession } = makeDeps(makeAthlete({ status: "onboarding" }));
      refreshSession.execute.mockResolvedValueOnce(MIGRATED);
      await createRouteInboundMessage(deps).execute(inbound);

      expect(appendUserMessage).toHaveBeenCalledWith(
        "sesn_new",
        expect.stringContaining(`onboarding_manquant: goal\n${CARRY_OVER_LINE}\nmessage: "salut"`)
      );
    });

    it("never refreshes a session the hand-off replaces anyway", async () => {
      const { deps, assessOnboarding, refreshSession } = makeDeps(makeAthlete({ status: "onboarding" }));
      assessOnboarding.execute.mockResolvedValueOnce({
        status: "assessed",
        state: { done: [...ONBOARDING_ITEMS], missing: [], complete: true }
      });
      await createRouteInboundMessage(deps).execute(inbound);

      expect(refreshSession.execute).not.toHaveBeenCalled();
    });

    it("keeps the athlete on their session, without carry-over, when the refresh did not move them", async () => {
      for (const outcome of [
        { status: "busy", sessionId: "sesn_abc" },
        { status: "failed", sessionId: "sesn_abc", reason: "could not check the session version" }
      ] satisfies RefreshOutcome[]) {
        const { deps, appendUserMessage, refreshSession } = makeDeps(makeAthlete());
        refreshSession.execute.mockResolvedValueOnce(outcome);
        await createRouteInboundMessage(deps).execute(inbound);

        expect(appendUserMessage).toHaveBeenCalledWith("sesn_abc", expect.not.stringContaining("reprise_conversation"));
      }
    });

    it("refreshes nothing for an ended or blocked athlete", async () => {
      for (const status of ["ended", "blocked"] as const) {
        const { deps, refreshSession } = makeDeps(makeAthlete({ status }));
        await createRouteInboundMessage(deps).execute(inbound);

        expect(refreshSession.execute).not.toHaveBeenCalled();
      }
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
      `${DATE_LINE}\ninigo_athlete_id: a-1\nathlete_display_name: Thomas\nlocale: fr\nmessage: "salut"`
    );
  });

  it.each([
    ["ended", "athlete_ended"],
    ["blocked", "athlete_blocked"]
  ] as const)("ignores a %s athlete without touching anything", async (status, reason) => {
    const { deps, appendUserMessage, rememberSender, assessOnboarding, handOff } = makeDeps(
      makeAthlete({ status, chatId: null })
    );
    const outcome = await createRouteInboundMessage(deps).execute(inbound);

    expect(outcome).toEqual({ status: "ignored", reason });
    expect(appendUserMessage).not.toHaveBeenCalled();
    expect(rememberSender).not.toHaveBeenCalled();
    expect(assessOnboarding.execute).not.toHaveBeenCalled();
    expect(handOff.execute).not.toHaveBeenCalled();
  });

  it("forwards nothing when the onboarding assessment fails (infra → 502 upstream)", async () => {
    const { deps, appendUserMessage, rememberSender, assessOnboarding } = makeDeps(
      makeAthlete({ status: "onboarding", chatId: null })
    );
    assessOnboarding.execute.mockRejectedValueOnce(new Error("intervals down"));
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("intervals down");
    expect(rememberSender).not.toHaveBeenCalled();
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("never registers a known athlete again", async () => {
    const { deps, register } = makeDeps(makeAthlete());
    await createRouteInboundMessage(deps).execute(inbound);
    expect(register.execute).not.toHaveBeenCalled();
  });

  it("ignores an unparseable sender without hitting the repo", async () => {
    const { deps, findBySender } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute({ chatId: "status@broadcast", body: "x" });

    expect(outcome).toEqual({ status: "ignored", reason: "invalid_sender" });
    expect(findBySender).not.toHaveBeenCalled();
  });

  it("ignores outbound (fromMe) messages", async () => {
    const { deps, findBySender } = makeDeps(makeAthlete());
    const outcome = await createRouteInboundMessage(deps).execute({ ...inbound, fromMe: true });
    expect(outcome).toEqual({ status: "ignored", reason: "outbound" });
    expect(findBySender).not.toHaveBeenCalled();
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
    const findBySender = vi.fn(() => Promise.reject(new Error("neon down")));
    const appendUserMessage = vi.fn(() => Promise.resolve());
    const deps = {
      repo: { findBySender, rememberSender: vi.fn(() => Promise.resolve()), ...unusedRepoMethods() },
      brain: { appendUserMessage },
      register: fakeRegister(),
      assessOnboarding: fakeAssess(),
      handOff: fakeHandOff(),
      refreshSession: fakeRefresh()
    };
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("neon down");
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("propagates a rememberSender failure without appending (infra → 502 upstream)", async () => {
    const appendUserMessage = vi.fn(() => Promise.resolve());
    const rememberSender = vi.fn(() => Promise.reject(new Error("neon down")));
    const deps = {
      repo: {
        findBySender: vi.fn(() => Promise.resolve([makeAthlete({ chatId: null })])),
        rememberSender,
        ...unusedRepoMethods()
      },
      brain: { appendUserMessage },
      register: fakeRegister(),
      assessOnboarding: fakeAssess(),
      handOff: fakeHandOff(),
      refreshSession: fakeRefresh()
    };
    await expect(createRouteInboundMessage(deps).execute(inbound)).rejects.toThrow("neon down");
    expect(appendUserMessage).not.toHaveBeenCalled();
  });

  it("propagates brain failures (infra → 502 upstream)", async () => {
    const appendUserMessage = vi.fn(() => Promise.reject(new Error("anthropic 500")));
    const deps = {
      repo: {
        findBySender: vi.fn(() => Promise.resolve([makeAthlete()])),
        rememberSender: vi.fn(() => Promise.resolve()),
        ...unusedRepoMethods()
      },
      brain: { appendUserMessage },
      register: fakeRegister(),
      assessOnboarding: fakeAssess(),
      handOff: fakeHandOff(),
      refreshSession: fakeRefresh()
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
      const { deps, findBySender, appendUserMessage } = makeDeps(athlete);
      const outcome = await createRouteInboundMessage(deps).execute(LID_DELIVERY);

      expect(findBySender).toHaveBeenCalledWith({ phone: null, lid: "10325252415590@lid" });
      expect(appendUserMessage).toHaveBeenCalledWith("sesn_abc", `${DATE_LINE}\ninigo_athlete_id: a-1\nathlete_display_name: Thomas\nlocale: fr\nmessage: "ok"`);
      expect(outcome).toMatchObject({ status: "forwarded", chatId: "10325252415590@lid" });
    });

    it("identifies a phone sender by their E.164 number only", async () => {
      const { deps, findBySender } = makeDeps(makeAthlete());
      const outcome = await createRouteInboundMessage(deps).execute(PHONE_DELIVERY);

      expect(findBySender).toHaveBeenCalledWith({ phone: "+32475123456", lid: null });
      expect(outcome).toMatchObject({ status: "forwarded", chatId: "32475123456@c.us" });
    });

    it("recognises an athlete known by number when they write from a LID, and learns the LID", async () => {
      const { deps, findBySender, rememberSender, appendUserMessage } = makeDeps(makeAthlete({ whatsappLid: null }));
      const outcome = await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        data: { ...LID_DELIVERY.data, senderPhone: "32475123456" }
      });

      expect(findBySender).toHaveBeenCalledWith({ phone: "+32475123456", lid: "10325252415590@lid" });
      expect(rememberSender).toHaveBeenCalledWith("a-1", {
        whatsappLid: "10325252415590@lid",
        chatId: "10325252415590@lid"
      });
      expect(appendUserMessage).toHaveBeenCalledOnce();
      expect(outcome).toMatchObject({ status: "forwarded", athleteId: "a-1" });
    });

    it("recognises an athlete known by LID when they write from their number, once the number is known", async () => {
      const athlete = makeAthlete({ whatsappLid: "10325252415590@lid", chatId: "10325252415590@lid" });
      const { deps, findBySender, rememberSender } = makeDeps(athlete);
      const outcome = await createRouteInboundMessage(deps).execute(PHONE_DELIVERY);

      expect(findBySender).toHaveBeenCalledWith({ phone: "+32475123456", lid: null });
      // The LID stays: a missing alias never erases a known one.
      expect(rememberSender).toHaveBeenCalledWith("a-1", { chatId: "32475123456@c.us" });
      expect(outcome).toMatchObject({ status: "forwarded", athleteId: "a-1" });
    });

    it("records a number that changed behind a known LID", async () => {
      const athlete = makeAthlete({ phoneNum: "+32470000000", whatsappLid: "10325252415590@lid", chatId: "10325252415590@lid" });
      const { deps, rememberSender } = makeDeps(athlete);
      await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        data: { ...LID_DELIVERY.data, senderPhone: "32475123456" }
      });

      expect(rememberSender).toHaveBeenCalledWith("a-1", { phoneNum: "+32475123456" });
    });

    it("refuses a known number behind another LID (recycled number), and rewrites nothing", async () => {
      const athlete = makeAthlete({ whatsappLid: "999999999999999@lid", chatId: "999999999999999@lid" });
      const { deps, appendUserMessage, rememberSender } = makeDeps(athlete);
      const outcome = await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        data: { ...LID_DELIVERY.data, senderPhone: "32475123456" }
      });

      expect(outcome).toEqual({ status: "sender_conflict", athleteIds: ["a-1"] });
      expect(appendUserMessage).not.toHaveBeenCalled();
      expect(rememberSender).not.toHaveBeenCalled();
    });

    it("writes nothing when the message teaches nothing new", async () => {
      const athlete = makeAthlete({ whatsappLid: "10325252415590@lid", chatId: "10325252415590@lid" });
      const { deps, rememberSender } = makeDeps(athlete);
      await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        data: { ...LID_DELIVERY.data, senderPhone: "32475123456" }
      });

      expect(rememberSender).not.toHaveBeenCalled();
    });

    it("registers an unknown LID sender with both aliases when the gateway resolved the number", async () => {
      const { deps, register } = makeDeps(null);
      await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        data: { ...LID_DELIVERY.data, senderPhone: "32475123456" }
      });

      expect(register.execute).toHaveBeenCalledWith({
        phoneNum: "+32475123456",
        whatsappLid: "10325252415590@lid",
        chatId: "10325252415590@lid",
        text: "ok"
      });
    });

    it("forwards nothing when the LID and the number belong to two different athletes", async () => {
      const { deps, findBySender, appendUserMessage, rememberSender, register } = makeDeps(makeAthlete());
      findBySender.mockResolvedValueOnce([makeAthlete({ id: "a-1" }), makeAthlete({ id: "a-2" })]);
      const outcome = await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        data: { ...LID_DELIVERY.data, senderPhone: "32475123456" }
      });

      expect(outcome).toEqual({ status: "sender_conflict", athleteIds: ["a-1", "a-2"] });
      expect(appendUserMessage).not.toHaveBeenCalled();
      expect(rememberSender).not.toHaveBeenCalled();
      expect(register.execute).not.toHaveBeenCalled();
    });

    it("treats a LID the gateway cannot tie to a number, and nobody carries, as unknown", async () => {
      const { deps, register } = makeDeps(null);
      const outcome = await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        data: { ...LID_DELIVERY.data, senderPhone: null }
      });

      expect(register.execute).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNum: null, whatsappLid: "10325252415590@lid" })
      );
      expect(outcome.status).toBe("unknown_sender");
    });

    it("never identifies anyone from the account's own sends (message.sent)", async () => {
      const { deps, findBySender } = makeDeps(makeAthlete());
      const outcome = await createRouteInboundMessage(deps).execute({
        ...LID_DELIVERY,
        event: "message.sent",
        data: { ...LID_DELIVERY.data, from: "447882748102@c.us", to: "243735870890225@lid", fromMe: true }
      });

      expect(outcome).toEqual({ status: "ignored", reason: "unhandled_event" });
      expect(findBySender).not.toHaveBeenCalled();
    });

    it("never takes a status poster's author for the sender", async () => {
      const { deps, findBySender } = makeDeps(makeAthlete());
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
      expect(findBySender).not.toHaveBeenCalled();
    });
  });
});
