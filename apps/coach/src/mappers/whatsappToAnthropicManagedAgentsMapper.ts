import type { ManagedAgentBrain } from "../brain/managedAgents";
import {
  webhookEnvelopeSchema,
  normaliseInbound,
  messageText,
  replyChatId
} from "./whatsappPayload";

export type MapResult =
  | { status: "ignored"; reason: string }
  | { status: "forwarded"; chatId: string };

export interface MapperDeps {
  brain: ManagedAgentBrain;
  /** The fixed managed-agent session inbound messages are appended to. */
  sessionId: string;
}

/**
 * Map one inbound OpenWA webhook payload into a `user.message` appended to the
 * fixed managed-agent session.
 *
 * Filters out anything that shouldn't reach the coach (outbound echoes, groups,
 * non-text) and embeds the WhatsApp `chatId` in the message so the agent knows
 * which chat to reply to (via its OpenWA MCP send tool). Signature verification,
 * if enabled, happens in the route before this is called.
 */
export async function whatsappToAnthropicManagedAgentsMapper(
  deps: MapperDeps,
  payload: unknown
): Promise<MapResult> {
  const parsed = webhookEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: "ignored", reason: "payload did not match webhook schema" };
  }

  const { event, message } = normaliseInbound(parsed.data);
  if (event !== undefined && event !== "message.received") {
    return { status: "ignored", reason: `unhandled event: ${event}` };
  }
  if (message.fromMe === true) {
    return { status: "ignored", reason: "message is outbound (fromMe)" };
  }
  if (message.isGroup === true) {
    return { status: "ignored", reason: "group messages are not handled" };
  }

  const text = messageText(message);
  const chatId = replyChatId(message);
  if (!text || !chatId) {
    return { status: "ignored", reason: "message has no text or no chat id" };
  }

  await deps.brain.appendUserMessage(deps.sessionId, formatTurn(chatId, text));
  return { status: "forwarded", chatId };
}

/**
 * Format a turn so the agent knows which WhatsApp chat to reply to. The agent's
 * system prompt (configured on the control plane) explains this envelope and
 * instructs it to reply via the OpenWA send tool using `chat_id`.
 */
export function formatTurn(chatId: string, text: string): string {
  return `chat_id: ${chatId}\nmessage: ${text}`;
}
