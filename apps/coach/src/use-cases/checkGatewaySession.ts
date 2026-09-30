import type { GatewayAlerter } from "../alerts/gatewayAlerter";
import type { GatewayAlert, GatewaySession } from "../domain/whatsappGateway";
import type { WhatsappGatewayRepository } from "../repositories/whatsappGatewayRepository";
import type { OpenWaClient } from "../whatsapp/client";
import type { ResolveOpenWaClient } from "../whatsapp/resolveClient";

/**
 * Statuses a plain `POST /start` can fix: the device is still linked, only the engine is down
 * (a stop, an engine crash, or a reconnect chain that ran out, which OpenWA never resumes by
 * itself). `qr_ready` and `action_required` need a human to link WhatsApp again: restarting
 * would only produce a fresh QR, so those stay alerts.
 */
const RESTARTABLE_STATUSES: ReadonlySet<string> = new Set(["disconnected", "failed"]);

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
  /** The session was down but restartable: the watchdog asked the gateway to start it. */
  | { status: "restarted"; sessionId: string; previousStatus: string }
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
 * A session that is merely stopped or failed is restarted, once per run: no human has to open a
 * terminal for the most common outage. The outcome of that restart is reported in real time by
 * the session webhooks (`ready` → recovery, `failed` → alert), and the next run checks again.
 * Restarting only here, never from the webhook, is deliberate: a start that fails at once would
 * turn start → failed → start into a loop, where the cron's own schedule is the rate limit.
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

      let client: OpenWaClient;
      let session: GatewaySession | null;
      try {
        client = deps.resolveClient();
        session = await client.getSession(sessionId);
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

      if (RESTARTABLE_STATUSES.has(session.status)) {
        return restart(deps.alerter, client, session);
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

async function restart(
  alerter: GatewayAlerter,
  client: OpenWaClient,
  session: GatewaySession
): Promise<GatewayCheckOutcome> {
  const detail = session.lastError ? ` (${session.lastError})` : "";
  try {
    await client.startSession(session.id);
  } catch (error) {
    return unhealthy(alerter, GatewayCheckFailure.SessionNotReady, {
      message:
        `La session est en statut \`${session.status}\`${detail} et la relance automatique a échoué : ` +
        `${error instanceof Error ? error.message : String(error)}. Vérifie le dashboard OpenWA.`,
      sessionId: session.id
    });
  }
  await alerter.notify({
    severity: "down",
    source: "watchdog",
    code: "session_restarted",
    message:
      `La session était en statut \`${session.status}\`${detail}, le watchdog l'a relancée. ` +
      "Un message de rétablissement suivra si elle repasse en ready, sinon une nouvelle alerte.",
    sessionId: session.id
  });
  return { status: "restarted", sessionId: session.id, previousStatus: session.status };
}

async function unhealthy(
  alerter: GatewayAlerter,
  reason: GatewayCheckFailure,
  alert: Pick<GatewayAlert, "message" | "sessionId">
): Promise<GatewayCheckOutcome> {
  await alerter.notify({ severity: "down", source: "watchdog", code: reason, ...alert });
  return { status: "unhealthy", reason };
}
