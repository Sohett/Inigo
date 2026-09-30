import type { GatewayAlerter } from "../alerts/gatewayAlerter";
import type { GatewayAlert } from "../domain/whatsappGateway";
import { gatewaySessionEventSchema, type GatewaySessionEvent } from "../mappers/whatsappPayload";
import type { WhatsappGatewayRepository } from "../repositories/whatsappGatewayRepository";

/**
 * Session statuses that need a human. `qr_ready` and `action_required` mean WhatsApp wants the
 * device linked again (QR or code); `failed` is terminal on OpenWA, nothing retries it.
 *
 * `disconnected` is deliberately absent: an engine or WhatsApp side drop already raises its own
 * `session.disconnected` event (alerted, with the reason), and alerting on the status too would
 * send every drop twice. The status alone, without that event, is an API initiated stop: an
 * operator did it on purpose.
 */
const STATUSES_NEEDING_A_HUMAN: ReadonlySet<string> = new Set(["qr_ready", "action_required", "failed"]);

export type GatewaySessionEventOutcome =
  | { status: "alerted"; code: string }
  | { status: "recovered" }
  | { status: "ignored"; reason: "malformed_payload" | "transitional_status" | "other_session" };

export interface HandleGatewaySessionEventDeps {
  alerter: GatewayAlerter;
  /** The session the coach sends through: only its events say whether athletes are heard. */
  gateway: WhatsappGatewayRepository;
}

export interface HandleGatewaySessionEvent {
  execute(payload: unknown): Promise<GatewaySessionEventOutcome>;
}

/**
 * React to an OpenWA session lifecycle webhook: raise an alert when the session stops being able
 * to receive athletes' messages, and say so when it is back. This is the real time half of the
 * INI-40 monitoring; the watchdog cron covers the case where the gateway is too dead to call us.
 *
 * Events are compared with the session recorded in Neon. After a re-pairing the old session keeps
 * emitting (it fails, it disconnects): that is noise, not an outage, and is ignored. A *new*
 * session reaching `ready` while the coach still sends through the old one is the opposite: the
 * coach is mute until the admin is updated, so it is an alert, not a recovery. When Neon cannot be
 * read, every event is treated as the recorded session's: an outage must fail loud.
 *
 * Never throws for a business reason, and the alerter never throws at all, so the webhook always
 * answers 200 and BullMQ never replays a session event into a second alert.
 */
export function createHandleGatewaySessionEvent(
  deps: HandleGatewaySessionEventDeps
): HandleGatewaySessionEvent {
  return {
    async execute(payload: unknown): Promise<GatewaySessionEventOutcome> {
      const parsed = gatewaySessionEventSchema.safeParse(payload);
      if (!parsed.success) return { status: "ignored", reason: "malformed_payload" };

      const event = parsed.data;
      if (!(await isRecordedSession(deps.gateway, event.data.sessionId))) {
        if (event.event !== "session.status" || event.data.status !== "ready") {
          return { status: "ignored", reason: "other_session" };
        }
        const alert = unrecordedSessionReady(event.data.sessionId);
        await deps.alerter.notify(alert);
        return { status: "alerted", code: alert.code };
      }

      const alert = alertFor(event);
      if (!alert) return { status: "ignored", reason: "transitional_status" };

      await deps.alerter.notify(alert);
      return alert.severity === "recovered" ? { status: "recovered" } : { status: "alerted", code: alert.code };
    }
  };
}

/** Whether the event concerns the recorded session. Unknown (Neon unreadable) counts as yes. */
async function isRecordedSession(gateway: WhatsappGatewayRepository, sessionId: string): Promise<boolean> {
  try {
    return (await gateway.getSessionId()) === sessionId;
  } catch (error) {
    console.error("[coach] session event: could not read the recorded gateway session", error);
    return true;
  }
}

function unrecordedSessionReady(sessionId: string): GatewayAlert {
  return {
    severity: "down",
    source: "webhook",
    code: "unrecorded_session_ready",
    message:
      "Une session WhatsApp est connectée, mais ce n'est pas celle par laquelle le coach envoie. " +
      "Mets à jour la session dans l'admin, sinon le coach ne peut pas répondre.",
    sessionId
  };
}

function alertFor(event: GatewaySessionEvent): GatewayAlert | null {
  const sessionId = event.data.sessionId;
  switch (event.event) {
    case "session.disconnected":
      return {
        severity: "down",
        source: "webhook",
        code: "session_disconnected",
        message:
          `La session WhatsApp s'est déconnectée (${event.data.reason ?? "raison inconnue"}). ` +
          "OpenWA tente de se reconnecter : si elle ne revient pas, vérifie le dashboard OpenWA.",
        sessionId
      };
    case "session.reconnect_loop":
      return {
        severity: "down",
        source: "webhook",
        code: "session_reconnect_loop",
        message:
          `OpenWA n'arrive pas à reconnecter la session (${event.data.attempts} tentatives). ` +
          "Une intervention est probablement nécessaire.",
        sessionId
      };
    case "session.status":
      if (event.data.status === "ready") {
        return {
          severity: "recovered",
          source: "webhook",
          code: "session_ready",
          message: "La session est connectée, les messages arrivent de nouveau.",
          sessionId
        };
      }
      if (STATUSES_NEEDING_A_HUMAN.has(event.data.status)) {
        return {
          severity: "down",
          source: "webhook",
          code: `session_${event.data.status}`,
          message:
            `La session est passée en statut \`${event.data.status}\`. ` +
            "Intervention requise sur le dashboard OpenWA (redémarrer la session, ou relier WhatsApp par QR ou code). " +
            "Si une nouvelle session est créée, mets la à jour dans l'admin.",
          sessionId
        };
      }
      return null;
  }
}
