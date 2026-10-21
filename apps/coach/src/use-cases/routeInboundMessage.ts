import type { ManagedAgentBrain } from "../brain/managedAgents";
import { formatHandoffTurn, formatOnboardingTurn, formatTurn } from "../brain/taskEnvelope";
import type { ActiveSession, Athlete, SenderChanges, SenderIdentity } from "../domain/athlete";
import type { SessionExchange } from "../domain/brain";
import type { AthleteRepository } from "../repositories/athleteRepository";
import { AssessStatus, type AssessOnboarding } from "./assessOnboarding";
import { HandOffStatus, type HandOffToCoordinator } from "./handOffToCoordinator";
import { RefreshStatus, type RefreshAthleteSession } from "./refreshAthleteSession";
import type { RegisterNewAthlete, RegisterOutcome } from "./registerNewAthlete";
import {
  webhookEnvelopeSchema,
  normaliseInbound,
  messageText,
  replyChatId,
  senderIdentity
} from "../mappers/whatsappPayload";

/**
 * Why an inbound delivery was not forwarded. Every value is a normal business
 * outcome (the route answers 200) — not an error. Infrastructure failures are not
 * here: they throw and surface as a 502.
 */
export const IgnoreReason = {
  MalformedPayload: "malformed_payload",
  UnhandledEvent: "unhandled_event",
  Outbound: "outbound",
  Group: "group",
  NoText: "no_text",
  /** (d) The sender JID held no usable phone digits. */
  InvalidSender: "invalid_sender",
  /** (b) The athlete exists but has no Managed Agent session yet. */
  NoSession: "no_session",
  /** The coaching relationship is over: nothing reaches an agent any more. */
  AthleteEnded: "athlete_ended",
  /** The coach blocked the athlete for a hijack attempt (INI-66): nothing reaches an agent any more. */
  AthleteBlocked: "athlete_blocked"
} as const;

export type IgnoreReason = (typeof IgnoreReason)[keyof typeof IgnoreReason];

/** What happened to an inbound delivery. */
export const RouteStatus = {
  Forwarded: "forwarded",
  /** The athlete finished onboarding and was handed to the coordinator (INI-49). */
  HandedOff: "handed_off",
  HandoffNotConfigured: "handoff_not_configured",
  UnknownSender: "unknown_sender",
  SenderConflict: "sender_conflict",
  Ignored: "ignored"
} as const;

export type RouteStatus = (typeof RouteStatus)[keyof typeof RouteStatus];

export type RouteOutcome =
  | { status: typeof RouteStatus.Forwarded; athleteId: string; sessionId: string; chatId: string }
  /** The athlete finished onboarding: now `active`, their message went to a new coordinator session. */
  | { status: typeof RouteStatus.HandedOff; athleteId: string; sessionId: string; chatId: string }
  /**
   * The athlete finished onboarding but no coordinator can take them (`reason` says what to fix):
   * the message went to their onboarding session, as before.
   */
  | { status: typeof RouteStatus.HandoffNotConfigured; athleteId: string; sessionId: string; chatId: string; reason: string }
  /** No athlete carries this phone or LID: the sender went through onboarding registration. */
  | { status: typeof RouteStatus.UnknownSender; registration: RegisterOutcome }
  /**
   * The sender's aliases contradict the records (INI-64): their LID and number belong to two
   * athletes, or their number belongs to an athlete whose known LID is another one (a recycled
   * number). Nothing is forwarded; an operator must fix the records.
   */
  | { status: typeof RouteStatus.SenderConflict; athleteIds: string[] }
  | { status: typeof RouteStatus.Ignored; reason: IgnoreReason };

export interface RouteInboundMessageDeps {
  repo: AthleteRepository;
  brain: Pick<ManagedAgentBrain, "appendUserMessage">;
  /** What happens to a sender no athlete carries (INI-45). */
  register: RegisterNewAthlete;
  /** Where an athlete in onboarding stands, carried in each of their turns (INI-46). */
  assessOnboarding: AssessOnboarding;
  /** What happens to an athlete whose onboarding is complete (INI-49). */
  handOff: HandOffToCoordinator;
  /** Moves an athlete off a session frozen on an outdated agent version (INI-27). */
  refreshSession: RefreshAthleteSession;
}

export interface RouteInboundMessage {
  execute(payload: unknown): Promise<RouteOutcome>;
}

/**
 * The routing use-case: one public `execute`. It parses the OpenWA webhook payload,
 * filters what shouldn't reach the coach, resolves the athlete + session from either alias of
 * the sender (WhatsApp LID or number), records the alias or reply address it did not know yet,
 * and appends the message to the *right* Managed Agent session.
 *
 * Routing decisions (unknown sender, no session, ended or blocked athlete…) are returned as outcomes.
 * Only infrastructure failures throw (repository, brain, and the onboarding assessment, which
 * reads the DB and Intervals.icu), so the route answers 200 for a handled delivery and 502 only
 * when something is actually broken. The turn is resolved first (its only side effect is the
 * hand-off to the coordinator, itself atomic), and the brain append is the last effect, so a
 * failed `rememberSender` never leaves a half-appended message. A failed append after a hand-off is
 * retried by OpenWA as an `active` athlete's turn, without the hand-off line. (The append itself is at-least-once: with no
 * idempotency key in V0, a dropped response after Anthropic recorded the event can
 * still re-append on an OpenWA retry.)
 */
export function createRouteInboundMessage(deps: RouteInboundMessageDeps): RouteInboundMessage {
  return {
    async execute(payload: unknown): Promise<RouteOutcome> {
      const parsed = webhookEnvelopeSchema.safeParse(payload);
      if (!parsed.success) return ignored(IgnoreReason.MalformedPayload);

      const { event, message } = normaliseInbound(parsed.data);
      if (event !== undefined && event !== "message.received") return ignored(IgnoreReason.UnhandledEvent);
      if (message.fromMe === true) return ignored(IgnoreReason.Outbound);
      if (message.isGroup === true) return ignored(IgnoreReason.Group);

      const text = messageText(message);
      const chatId = replyChatId(message);
      if (!text || !chatId) return ignored(IgnoreReason.NoText);

      // The LID and the number are two aliases of one WhatsApp account; either may be missing.
      const sender = senderIdentity(message);
      if (!sender.lid && !sender.phone) return ignored(IgnoreReason.InvalidSender);
      const found = await deps.repo.findBySender(sender);
      if (found.length > 1) return { status: RouteStatus.SenderConflict, athleteIds: found.map(({ id }) => id) };
      const [athlete] = found;
      // The LID is bound to the WhatsApp account, a number can be reassigned: another LID behind a
      // known number is someone else, never a reason to rewrite the record.
      if (athlete && hasAnotherLid(athlete, sender)) return { status: RouteStatus.SenderConflict, athleteIds: [athlete.id] };
      if (!athlete) {
        const registration = await deps.register.execute({
          phoneNum: sender.phone,
          whatsappLid: sender.lid,
          chatId,
          text
        });
        return { status: RouteStatus.UnknownSender, registration };
      }
      const { activeSession } = athlete;
      if (!activeSession) return ignored(IgnoreReason.NoSession);

      const turn = await resolveTurn(athlete, activeSession, text, deps);
      if (typeof turn === "string") return ignored(turn);

      // Learn a new alias or reply address, then forward.
      const changes = senderChanges(athlete, sender, chatId);
      if (changes) await deps.repo.rememberSender(athlete.id, changes);
      await deps.brain.appendUserMessage(turn.sessionId, turn.text);

      return { ...turn.outcome, athleteId: athlete.id, sessionId: turn.sessionId, chatId };
    }
  };
}

/** What an athlete's message becomes: which session it goes to, its envelope, and what to report. */
interface Turn {
  sessionId: string;
  text: string;
  outcome:
    | { status: typeof RouteStatus.Forwarded | typeof RouteStatus.HandedOff }
    | { status: typeof RouteStatus.HandoffNotConfigured; reason: string };
}

/**
 * The turn an athlete's message becomes, by lifecycle status, or why nothing should reach an agent.
 * An athlete in onboarding gets their checklist with it, until it is complete: their message then
 * goes to the coordinator, with the hand-off line. A paused one still talks to the coach (they may
 * be coming back). An ended or blocked one is stopped here, before any side effect.
 *
 * A message that stays on the athlete's session first moves them off it if it runs an outdated
 * agent version (INI-27): the turn then goes to the new session, with the end of the previous
 * conversation. A hand-off opens a new session anyway, so it is never refreshed.
 */
async function resolveTurn(
  athlete: Athlete,
  session: ActiveSession,
  text: string,
  deps: Pick<RouteInboundMessageDeps, "assessOnboarding" | "handOff" | "refreshSession">
): Promise<Turn | IgnoreReason> {
  switch (athlete.status) {
    case "onboarding":
      return resolveOnboardingTurn(athlete, session, text, deps);
    case "active":
    case "paused": {
      const { sessionId, carryOver } = await refreshed(athlete, session, deps);
      return {
        sessionId,
        text: formatTurn(athlete, text, new Date(), carryOver),
        outcome: { status: RouteStatus.Forwarded }
      };
    }
    case "ended":
      return IgnoreReason.AthleteEnded;
    case "blocked":
      return IgnoreReason.AthleteBlocked;
  }
}

async function resolveOnboardingTurn(
  athlete: Athlete,
  session: ActiveSession,
  text: string,
  deps: Pick<RouteInboundMessageDeps, "assessOnboarding" | "handOff" | "refreshSession">
): Promise<Turn> {
  const assessed = await deps.assessOnboarding.execute(athlete.id);
  if (assessed.status === AssessStatus.UnknownAthlete) {
    throw new Error(`Athlete ${athlete.id} vanished while routing their message.`);
  }
  const onboardingTurn = async (outcome: Turn["outcome"]): Promise<Turn> => {
    const { sessionId, carryOver } = await refreshed(athlete, session, deps);
    return { sessionId, text: formatOnboardingTurn(athlete, assessed.state, text, new Date(), carryOver), outcome };
  };
  if (!assessed.state.complete) return onboardingTurn({ status: RouteStatus.Forwarded });

  const handOff = await deps.handOff.execute(athlete);
  switch (handOff.status) {
    case HandOffStatus.HandedOff:
      return {
        sessionId: handOff.sessionId,
        text: formatHandoffTurn(athlete, text),
        outcome: { status: RouteStatus.HandedOff }
      };
    case HandOffStatus.NotConfigured:
      return onboardingTurn({ status: RouteStatus.HandoffNotConfigured, reason: handOff.reason });
  }
}

/**
 * The session a turn that stays with the athlete goes to, and what of the previous conversation it
 * carries: the new session and its carry-over after a move, the current session otherwise.
 */
async function refreshed(
  athlete: Athlete,
  session: ActiveSession,
  deps: Pick<RouteInboundMessageDeps, "refreshSession">
): Promise<{ sessionId: string; carryOver: SessionExchange[] }> {
  const refresh = await deps.refreshSession.execute(athlete, session);
  switch (refresh.status) {
    case RefreshStatus.Migrated:
      return { sessionId: refresh.sessionId, carryOver: refresh.carryOver };
    case RefreshStatus.Current:
    case RefreshStatus.Busy:
    case RefreshStatus.Failed:
      return { sessionId: refresh.sessionId, carryOver: [] };
  }
}

/** Whether the sender carries a LID and the athlete already has a different one. */
function hasAnotherLid(athlete: Athlete, sender: SenderIdentity): boolean {
  return sender.lid !== null && athlete.whatsappLid !== null && sender.lid !== athlete.whatsappLid;
}

/**
 * What this message teaches about a known athlete, or null when nothing differs: the LID the record
 * lacks, a number that changed behind the same LID, and the reply address. A missing alias never
 * erases one, and a known LID is never replaced (see `hasAnotherLid`).
 */
function senderChanges(athlete: Athlete, sender: SenderIdentity, chatId: string): SenderChanges | null {
  const changes: SenderChanges = {};
  if (sender.phone && sender.phone !== athlete.phoneNum) changes.phoneNum = sender.phone;
  if (sender.lid && !athlete.whatsappLid) changes.whatsappLid = sender.lid;
  if (chatId !== athlete.chatId) changes.chatId = chatId;
  return Object.keys(changes).length > 0 ? changes : null;
}

function ignored(reason: IgnoreReason): RouteOutcome {
  return { status: RouteStatus.Ignored, reason };
}
