import type { ManagedAgentBrain } from "../brain/managedAgents";
import type { AthleteRepository } from "../repositories/athleteRepository";
import {
  webhookEnvelopeSchema,
  normaliseInbound,
  messageText,
  replyChatId,
  senderPhone
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
  /** (c) No athlete is registered for this phone. */
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
 * sender's phone, and appends the message to the *right* Managed Agent session.
 *
 * Routing decisions — including unknown number and no-session — are returned as
 * outcomes. Only infrastructure failures (repository / brain) throw, so the route
 * can answer 200 for a handled delivery and 502 only when something is actually
 * broken. The brain append is the last side effect, so a 502 never leaves a
 * duplicate message on an OpenWA retry.
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

      const phone = senderPhone(message);
      if (!phone) return ignored(IgnoreReason.InvalidSender);

      const athlete = await deps.repo.findByPhone(phone);
      if (!athlete) return ignored(IgnoreReason.UnknownNumber);
      if (!athlete.anthropicSessionId) return ignored(IgnoreReason.NoSession);

      // Learn the reply target on first contact (or if it changed), then forward.
      if (athlete.chatId !== chatId) {
        await deps.repo.setChatId(athlete.id, chatId);
      }
      await deps.brain.appendUserMessage(athlete.anthropicSessionId, formatTurn(chatId, text));

      return { status: "forwarded", athleteId: athlete.id, sessionId: athlete.anthropicSessionId, chatId };
    }
  };
}

function ignored(reason: IgnoreReason): RouteOutcome {
  return { status: "ignored", reason };
}

/**
 * Format a turn so the agent knows which WhatsApp chat to reply to. The agent's
 * system prompt (configured on the control plane) explains this envelope and
 * instructs it to reply via the OpenWA send tool using `chat_id`.
 */
export function formatTurn(chatId: string, text: string): string {
  return `chat_id: ${chatId}\nmessage: ${text}`;
}
