import { z } from "zod";

/**
 * A single inbound WhatsApp message as delivered by OpenWA.
 *
 * OpenWA does not publish a strict JSON schema for the webhook body, so this is
 * intentionally lenient: only the fields we actually use are typed, the rest are
 * tolerated. Text lives in `body` (whatsapp-web.js convention); some payloads
 * also expose `text`. Verify against a real delivery during bring-up and tighten
 * if needed.
 */
export const inboundMessageSchema = z
  .object({
    id: z.string().optional(),
    chatId: z.string().optional(),
    from: z.string().optional(),
    body: z.string().optional(),
    text: z.string().optional(),
    type: z.string().optional(),
    fromMe: z.boolean().optional(),
    isGroup: z.boolean().optional()
  })
  .passthrough();

export type InboundMessage = z.infer<typeof inboundMessageSchema>;

/**
 * Webhook envelope. OpenWA may deliver either a wrapped event
 * (`{ event, session, data: <message> }`) or a bare message object. Accept both
 * and let `normaliseInbound` normalise.
 */
export const webhookEnvelopeSchema = z.union([
  z
    .object({
      event: z.string().optional(),
      session: z.string().optional(),
      data: inboundMessageSchema
    })
    .passthrough(),
  inboundMessageSchema
]);

export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

export interface NormalisedInbound {
  /** Event name when wrapped (e.g. "message.received"), else undefined. */
  event: string | undefined;
  message: InboundMessage;
}

/**
 * Normalise a parsed webhook envelope to `{ event, message }`, whether the
 * payload was wrapped in `data` or delivered flat.
 */
export function normaliseInbound(envelope: WebhookEnvelope): NormalisedInbound {
  const wrapped = envelope as { event?: unknown; data?: unknown };
  if (wrapped.data !== undefined && wrapped.data !== null) {
    const inner = inboundMessageSchema.safeParse(wrapped.data);
    if (inner.success) {
      const event = typeof wrapped.event === "string" ? wrapped.event : undefined;
      return { event, message: inner.data };
    }
  }
  return { event: undefined, message: envelope as InboundMessage };
}

/** Text of an inbound message, preferring `body` over `text`. */
export function messageText(message: InboundMessage): string | undefined {
  return message.body ?? message.text;
}

/** Reply target for an inbound message, preferring `chatId` over `from`. */
export function replyChatId(message: InboundMessage): string | undefined {
  return message.chatId ?? message.from;
}

/**
 * The sender's phone as E.164 (`+…`), parsed from the WhatsApp JID transport
 * envelope. This is NOT phone normalisation: WhatsApp already delivers a full
 * international number, so we only strip the `@…` domain and any `:device` suffix
 * and prefix `+` (which matches the E.164 form stored in `athlete.phone_num`).
 * Returns null for group JIDs or when no digits remain (e.g. `status@broadcast`).
 */
export function senderPhone(message: InboundMessage): string | null {
  const jid = message.from ?? message.chatId;
  if (!jid || jid.endsWith("@g.us")) return null;
  const local = jid.split("@", 1)[0] ?? "";
  const digits = (local.split(":", 1)[0] ?? "").replace(/\D/g, "");
  return digits.length > 0 ? `+${digits}` : null;
}
