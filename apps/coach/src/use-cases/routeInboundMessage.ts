import type { ManagedAgentBrain } from "../brain/managedAgents";
import { formatOnboardingTurn, formatTurn } from "../brain/taskEnvelope";
import type { Athlete } from "../domain/athlete";
import type { AthleteRepository } from "../repositories/athleteRepository";
import type { AssessOnboarding } from "./assessOnboarding";
import type { RegisterNewAthlete, RegisterOutcome } from "./registerNewAthlete";
import {
  webhookEnvelopeSchema,
  normaliseInbound,
  messageText,
  replyChatId,
  senderPhone,
  senderLid
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
  /** No athlete carries this phone or LID: the sender went through onboarding registration. */
  | { status: "unknown_sender"; registration: RegisterOutcome }
  | { status: "ignored"; reason: IgnoreReason };

export interface RouteInboundMessageDeps {
  repo: AthleteRepository;
  brain: ManagedAgentBrain;
  /** What happens to a sender no athlete carries (INI-45). */
  register: RegisterNewAthlete;
  /** Where an athlete in onboarding stands, carried in each of their turns (INI-46). */
  assessOnboarding: AssessOnboarding;
}

export interface RouteInboundMessage {
  execute(payload: unknown): Promise<RouteOutcome>;
}

/**
 * The routing use-case: one public `execute`. It parses the OpenWA webhook payload,
 * filters what shouldn't reach the coach, resolves the athlete + session from the
 * sender's phone or WhatsApp LID, and appends the message to the *right* Managed Agent session.
 *
 * Routing decisions (unknown sender, no session, ended athlete…) are returned as outcomes.
 * Only infrastructure failures throw (repository, brain, and the onboarding assessment, which
 * reads the DB and Intervals.icu), so the route answers 200 for a handled delivery and 502 only
 * when something is actually broken. The turn is built before any side effect, and the brain
 * append is the last one, so a failed `setChatId` never leaves a half-appended message. (The append itself is at-least-once: with no
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

      // The sender arrives either as a LID (WhatsApp privacy addressing) or a phone
      // JID. A LID is an opaque token, not a phone, so each has its own routing key.
      const lid = senderLid(message);
      const phone = senderPhone(message);
      if (!lid && !phone) return ignored(IgnoreReason.InvalidSender);
      const athlete = await findSender(deps.repo, lid, phone);
      if (!athlete) {
        const registration = await deps.register.execute({ phoneNum: phone, whatsappLid: lid, chatId, text });
        return { status: "unknown_sender", registration };
      }
      const { activeSession } = athlete;
      if (!activeSession) return ignored(IgnoreReason.NoSession);

      // Built before any side effect: a failure here (DB, Intervals.icu) leaves nothing half done.
      const turn = await buildTurn(athlete, text, deps.assessOnboarding);
      if (turn === null) return ignored(IgnoreReason.AthleteEnded);

      // Learn the reply target on first contact (or if it changed), then forward.
      if (athlete.chatId !== chatId) {
        await deps.repo.setChatId(athlete.id, chatId);
      }
      await deps.brain.appendUserMessage(activeSession.sessionId, turn);

      return { status: "forwarded", athleteId: athlete.id, sessionId: activeSession.sessionId, chatId };
    }
  };
}

/**
 * The turn an athlete's message becomes, by lifecycle status, or null when nothing should reach
 * an agent. An athlete in onboarding gets their checklist with it; a paused one still talks to
 * the coach (they may be coming back).
 */
async function buildTurn(
  athlete: Athlete,
  text: string,
  assessOnboarding: AssessOnboarding
): Promise<string | null> {
  switch (athlete.status) {
    case "onboarding": {
      const assessed = await assessOnboarding.execute(athlete.id);
      if (assessed.status === "unknown_athlete") {
        throw new Error(`Athlete ${athlete.id} vanished while routing their message.`);
      }
      return formatOnboardingTurn(athlete.id, assessed.state, text);
    }
    case "active":
    case "paused":
      return formatTurn(athlete.id, text);
    case "ended":
      return null;
  }
}

/** The athlete behind a sender: by LID when WhatsApp hides the number, else by phone. */
function findSender(
  repo: AthleteRepository,
  lid: string | null,
  phone: string | null
): Promise<Athlete | null> {
  if (lid) return repo.findByLid(lid);
  if (phone) return repo.findByPhone(phone);
  return Promise.resolve(null);
}

function ignored(reason: IgnoreReason): RouteOutcome {
  return { status: "ignored", reason };
}
