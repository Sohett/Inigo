import type { AthleteRepository } from "../repositories/athleteRepository";
import type { WhatsappGatewayRepository } from "../repositories/whatsappGatewayRepository";
import type { ResolveOpenWaClient } from "../whatsapp/resolveClient";

/**
 * Why a message could not be sent. All are normal business outcomes the caller turns into a
 * message the agent can act on. Infrastructure failures are not here: the gateway refusing,
 * timing out or being unconfigured throws, and the caller reports it as such.
 */
export const SendMessageFailure = {
  /** No athlete carries this id. */
  AthleteNotFound: "athlete_not_found",
  /**
   * The athlete has never written, so no chat is known. WhatsApp does not let us open a
   * conversation from nothing: the chat is learned from an inbound message.
   */
  NoChatYet: "no_chat_yet",
  /**
   * No gateway session is recorded. Normal after a WhatsApp re-pairing, and resolved from the
   * admin rather than by a deploy.
   */
  NoGatewaySession: "no_gateway_session"
} as const;

export type SendMessageFailure = (typeof SendMessageFailure)[keyof typeof SendMessageFailure];

export type SendMessageOutcome =
  | { status: "sent"; athleteId: string }
  | { status: "failed"; reason: SendMessageFailure };

export interface SendAthleteMessageDeps {
  repo: AthleteRepository;
  /** The recorded gateway session; it lives in Neon because re-pairing WhatsApp changes it. */
  gateway: WhatsappGatewayRepository;
  /** Resolves the gateway client on call, so a missing credential stays local to this path. */
  resolveClient: ResolveOpenWaClient;
}

export interface SendAthleteMessage {
  execute(athleteId: string, text: string): Promise<SendMessageOutcome>;
}

/**
 * Send a message to an athlete over WhatsApp.
 *
 * This is the coach's only way to reach an athlete, and the only place that assembles what a
 * send needs: who the athlete is, which chat they were last seen on, and which gateway session
 * is currently paired. The MCP tool in front of it carries none of that — the agent names an
 * athlete and a text, which is the whole point of INI-37.
 *
 * Business failures are returned, not thrown, so the caller can phrase each one for whoever is
 * reading. A gateway that refuses or does not answer throws: that is not a decision, it is a
 * breakdown, and the client's message already says whether a retry is safe.
 */
export function createSendAthleteMessage(deps: SendAthleteMessageDeps): SendAthleteMessage {
  return {
    async execute(athleteId: string, text: string): Promise<SendMessageOutcome> {
      const athlete = await deps.repo.findById(athleteId);
      if (!athlete) return { status: "failed", reason: SendMessageFailure.AthleteNotFound };
      if (!athlete.chatId) return { status: "failed", reason: SendMessageFailure.NoChatYet };

      const sessionId = await deps.gateway.getSessionId();
      if (!sessionId) return { status: "failed", reason: SendMessageFailure.NoGatewaySession };

      await deps.resolveClient().sendText(sessionId, athlete.chatId, text);
      return { status: "sent", athleteId };
    }
  };
}
