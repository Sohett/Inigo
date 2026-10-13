import type { ManagedAgentBrain } from "../brain/managedAgents";
import { formatHandoffTurn, formatOnboardingTurn, formatTurn } from "../brain/taskEnvelope";
import type { Athlete, SenderChanges, SenderIdentity } from "../domain/athlete";
import type { AthleteRepository } from "../repositories/athleteRepository";
import type { AssessOnboarding } from "./assessOnboarding";
import type { HandOffToCoordinator } from "./handOffToCoordinator";
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
  AthleteEnded: "athlete_ended"
} as const;

export type IgnoreReason = (typeof IgnoreReason)[keyof typeof IgnoreReason];

export type RouteOutcome =
  | { status: "forwarded"; athleteId: string; sessionId: string; chatId: string }
  /** The athlete finished onboarding: now `active`, their message went to a new coordinator session. */
  | { status: "handed_off"; athleteId: string; sessionId: string; chatId: string }
  /**
   * The athlete finished onboarding but no coordinator can take them (`reason` says what to fix):
   * the message went to their onboarding session, as before.
   */
  | { status: "handoff_not_configured"; athleteId: string; sessionId: string; chatId: string; reason: string }
  /** No athlete carries this phone or LID: the sender went through onboarding registration. */
  | { status: "unknown_sender"; registration: RegisterOutcome }
  /**
   * The sender's aliases contradict the records (INI-64): their LID and number belong to two
   * athletes, or their number belongs to an athlete whose known LID is another one (a recycled
   * number). Nothing is forwarded; an operator must fix the records.
   */
  | { status: "sender_conflict"; athleteIds: string[] }
  | { status: "ignored"; reason: IgnoreReason };

export interface RouteInboundMessageDeps {
  repo: AthleteRepository;
  brain: ManagedAgentBrain;
  /** What happens to a sender no athlete carries (INI-45). */
  register: RegisterNewAthlete;
  /** Where an athlete in onboarding stands, carried in each of their turns (INI-46). */
  assessOnboarding: AssessOnboarding;
  /** What happens to an athlete whose onboarding is complete (INI-49). */
  handOff: HandOffToCoordinator;
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
 * Routing decisions (unknown sender, no session, ended athlete…) are returned as outcomes.
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
      if (found.length > 1) return { status: "sender_conflict", athleteIds: found.map(({ id }) => id) };
      const [athlete] = found;
      // The LID is bound to the WhatsApp account, a number can be reassigned: another LID behind a
      // known number is someone else, never a reason to rewrite the record.
      if (athlete && hasAnotherLid(athlete, sender)) return { status: "sender_conflict", athleteIds: [athlete.id] };
      if (!athlete) {
        const registration = await deps.register.execute({
          phoneNum: sender.phone,
          whatsappLid: sender.lid,
          chatId,
          text
        });
        return { status: "unknown_sender", registration };
      }
      const { activeSession } = athlete;
      if (!activeSession) return ignored(IgnoreReason.NoSession);

      const turn = await resolveTurn(athlete, activeSession.sessionId, text, deps);
      if (turn === null) return ignored(IgnoreReason.AthleteEnded);

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
    | { status: "forwarded" | "handed_off" }
    | { status: "handoff_not_configured"; reason: string };
}

/**
 * The turn an athlete's message becomes, by lifecycle status, or null when nothing should reach
 * an agent. An athlete in onboarding gets their checklist with it, until it is complete: their
 * message then goes to the coordinator, with the hand-off line. A paused one still talks to the
 * coach (they may be coming back).
 */
async function resolveTurn(
  athlete: Athlete,
  sessionId: string,
  text: string,
  deps: Pick<RouteInboundMessageDeps, "assessOnboarding" | "handOff">
): Promise<Turn | null> {
  switch (athlete.status) {
    case "onboarding":
      return resolveOnboardingTurn(athlete, sessionId, text, deps);
    case "active":
    case "paused":
      return { sessionId, text: formatTurn(athlete.id, text), outcome: { status: "forwarded" } };
    case "ended":
      return null;
  }
}

async function resolveOnboardingTurn(
  athlete: Athlete,
  sessionId: string,
  text: string,
  deps: Pick<RouteInboundMessageDeps, "assessOnboarding" | "handOff">
): Promise<Turn> {
  const assessed = await deps.assessOnboarding.execute(athlete.id);
  if (assessed.status === "unknown_athlete") {
    throw new Error(`Athlete ${athlete.id} vanished while routing their message.`);
  }
  const onboardingTurn = formatOnboardingTurn(athlete.id, assessed.state, text);
  if (!assessed.state.complete) return { sessionId, text: onboardingTurn, outcome: { status: "forwarded" } };

  const handOff = await deps.handOff.execute(athlete);
  switch (handOff.status) {
    case "handed_off":
      return {
        sessionId: handOff.sessionId,
        text: formatHandoffTurn(athlete.id, text),
        outcome: { status: "handed_off" }
      };
    case "not_configured":
      return {
        sessionId,
        text: onboardingTurn,
        outcome: { status: "handoff_not_configured", reason: handOff.reason }
      };
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
  return { status: "ignored", reason };
}
