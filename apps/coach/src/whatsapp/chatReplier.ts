import type { WhatsappGatewayRepository } from "../repositories/whatsappGatewayRepository";
import type { ChatReplier } from "../use-cases/registerNewAthlete";
import type { ResolveOpenWaClient } from "./resolveClient";

/**
 * `ChatReplier` over the OpenWA gateway: answer a chat we only know from an inbound message,
 * before any athlete exists (`sendAthleteMessage` needs one). A missing gateway session is a
 * breakdown here, not a business outcome: it throws, like the gateway refusing.
 */
export function createOpenWaChatReplier(deps: {
  gateway: WhatsappGatewayRepository;
  resolveClient: ResolveOpenWaClient;
}): ChatReplier {
  return {
    async replyToChat(chatId: string, text: string): Promise<void> {
      const sessionId = await deps.gateway.getSessionId();
      if (!sessionId) throw new Error("No WhatsApp gateway session recorded; set it in the admin.");
      await deps.resolveClient().sendText(sessionId, chatId, text);
    }
  };
}
