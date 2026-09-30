import type { GatewayAlert, GatewayAlerter } from "../alerts/gatewayAlerter";
import type { WhatsappGatewayRepository } from "../repositories/whatsappGatewayRepository";
import type { GatewaySession } from "../whatsapp/client";
import type { ResolveOpenWaClient } from "../whatsapp/resolveClient";

/** Why the watchdog found the gateway unable to deliver athletes' messages. */
export const GatewayCheckFailure = {
  /** No session is recorded in Neon: the coach cannot even tell which one to watch. */
  NoSessionRecorded: "no_session_recorded",
  /** The recorded session does not exist on the gateway (deleted, or replaced by a re-pairing). */
  SessionNotFound: "session_not_found",
  /** The session exists but is not `ready`. */
  SessionNotReady: "session_not_ready",
  /** The gateway is unconfigured, unreachable, or answered an error. */
  GatewayUnreachable: "gateway_unreachable"
} as const;

export type GatewayCheckFailure = (typeof GatewayCheckFailure)[keyof typeof GatewayCheckFailure];

export type GatewayCheckOutcome =
  | { status: "healthy"; sessionId: string }
  | { status: "unhealthy"; reason: GatewayCheckFailure };

export interface CheckGatewaySessionDeps {
  gateway: WhatsappGatewayRepository;
  resolveClient: ResolveOpenWaClient;
  alerter: GatewayAlerter;
}

export interface CheckGatewaySession {
  execute(): Promise<GatewayCheckOutcome>;
}

/**
 * The watchdog (INI-40): ask the gateway, from outside, whether the session the coach sends
 * through is `ready`, and alert when it is not. It exists for the failure the session webhooks
 * cannot report: a gateway too dead to call anyone.
 *
 * Every failure, the gateway breaking down included, becomes an alert and an outcome; nothing
 * throws, because a watchdog that crashes on the very outage it watches for is silent. Only the
 * Neon read may throw, and the route turns that into a 500 Vercel records.
 */
export function createCheckGatewaySession(deps: CheckGatewaySessionDeps): CheckGatewaySession {
  return {
    async execute(): Promise<GatewayCheckOutcome> {
      const sessionId = await deps.gateway.getSessionId();
      if (!sessionId) {
        return unhealthy(deps.alerter, GatewayCheckFailure.NoSessionRecorded, {
          message: "Aucune session de passerelle n'est enregistrée : renseigne la dans l'admin."
        });
      }

      let session: GatewaySession | null;
      try {
        session = await deps.resolveClient().getSession(sessionId);
      } catch (error) {
        return unhealthy(deps.alerter, GatewayCheckFailure.GatewayUnreachable, {
          message: `La passerelle OpenWA ne répond pas correctement : ${error instanceof Error ? error.message : String(error)}`,
          sessionId
        });
      }

      if (!session) {
        return unhealthy(deps.alerter, GatewayCheckFailure.SessionNotFound, {
          message:
            "La session enregistrée n'existe plus sur OpenWA. Relie WhatsApp puis mets à jour la session dans l'admin.",
          sessionId
        });
      }

      if (session.status !== "ready") {
        const detail = session.lastError ? ` (${session.lastError})` : "";
        return unhealthy(deps.alerter, GatewayCheckFailure.SessionNotReady, {
          message: `La session est en statut \`${session.status}\`${detail}. Vérifie le dashboard OpenWA.`,
          sessionId
        });
      }

      console.info(`[coach] watchdog: gateway session ${sessionId} is ready`);
      return { status: "healthy", sessionId };
    }
  };
}

async function unhealthy(
  alerter: GatewayAlerter,
  reason: GatewayCheckFailure,
  alert: Pick<GatewayAlert, "message" | "sessionId">
): Promise<GatewayCheckOutcome> {
  await alerter.notify({ severity: "down", source: "watchdog", code: reason, ...alert });
  return { status: "unhealthy", reason };
}
