import type { ManagedAgentBrain } from "../brain/managedAgents";
import type { Athlete } from "../domain/athlete";
import type { AthleteRepository } from "../repositories/athleteRepository";
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
  /** (c) No athlete is registered for this phone or WhatsApp LID. */
  UnknownNumber: "unknown_number",
  /** (b) The athlete exists but has no Managed Agent session yet. */
  NoSession: "no_session"
} as const;

export type IgnoreReason = (typeof IgnoreReason)[keyof typeof IgnoreReason];

export type RouteOutcome =
  | { status: "forwarded"; athleteId: string; sessionId: string; chatId: string }
  | { status: "ignored"; reason: IgnoreReason };

export interface RouteInboundMessageDeps {
  repo: AthleteRepository;
  brain: ManagedAgentBrain;
}

export interface RouteInboundMessage {
  execute(payload: unknown): Promise<RouteOutcome>;
}

/**
 * The routing use-case: one public `execute`. It parses the OpenWA webhook payload,
 * filters what shouldn't reach the coach, resolves the athlete + session from the
 * sender's phone or WhatsApp LID, and appends the message to the *right* Managed Agent session.
 *
 * Routing decisions — including unknown number and no-session — are returned as
 * outcomes. Only infrastructure failures (repository / brain) throw, so the route
 * can answer 200 for a handled delivery and 502 only when something is actually
 * broken. The brain append is kept as the last side effect, so a failed `setChatId`
 * never leaves a half-appended message. (The append itself is at-least-once: with no
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
      let athlete: Athlete | null;
      if (lid) {
        athlete = await deps.repo.findByLid(lid);
      } else {
        const phone = senderPhone(message);
        if (!phone) return ignored(IgnoreReason.InvalidSender);
        athlete = await deps.repo.findByPhone(phone);
      }
      if (!athlete) return ignored(IgnoreReason.UnknownNumber);
      if (!athlete.anthropicSessionId) return ignored(IgnoreReason.NoSession);

      // Learn the reply target on first contact (or if it changed), then forward.
      if (athlete.chatId !== chatId) {
        await deps.repo.setChatId(athlete.id, chatId);
      }
      await deps.brain.appendUserMessage(
        athlete.anthropicSessionId,
        formatTurn(athlete.id, chatId, text)
      );

      return { status: "forwarded", athleteId: athlete.id, sessionId: athlete.anthropicSessionId, chatId };
    }
  };
}

function ignored(reason: IgnoreReason): RouteOutcome {
  return { status: "ignored", reason };
}

/** Fallback timezone when the athlete's own timezone isn't known at this routing call site. */
const DEFAULT_TIMEZONE = "Europe/Brussels";

/**
 * The athlete's local calendar day as `YYYY-MM-DD (jour)`, with the French weekday,
 * computed in `timeZone`. This anchors every turn on a real date so no agent has to
 * guess "what day is today"; using the athlete's timezone keeps the day correct across
 * the midnight boundary. `formatToParts` avoids depending on locale-specific ordering.
 */
export function formatDateDuJour(now: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} (${part("weekday")})`;
}

/**
 * Format a turn the agent can act on. The envelope carries:
 *  - `date_du_jour`: the athlete's local day (`YYYY-MM-DD (jour)`) — the coordinator's
 *    temporal anchor so it never guesses today's date, and which it relays to specialists.
 *  - `inigo_athlete_id`: our internal athlete UUID (`athlete.id` in Neon). This is the
 *    key the agent uses to reach the athlete-data MCP (`/athlete/{id}/api/mcp`). It is
 *    deliberately NOT the Intervals.icu athlete id — that one lives in the Intervals MCP.
 *  - `chat_id`: the WhatsApp chat to reply to (via the OpenWA send tool).
 * The agent's system prompt (configured on the control plane) explains this envelope.
 *
 * `now`/`timeZone` are parameters (defaulting to now in `Europe/Brussels`) so the date is
 * deterministic under test; the routing `Athlete` carries no timezone yet, so `execute`
 * uses the default.
 */
export function formatTurn(
  inigoAthleteId: string,
  chatId: string,
  text: string,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  return `date_du_jour: ${formatDateDuJour(now, timeZone)}\ninigo_athlete_id: ${inigoAthleteId}\nchat_id: ${chatId}\nmessage: ${text}`;
}
