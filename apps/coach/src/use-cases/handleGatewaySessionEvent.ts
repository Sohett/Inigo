import type { GatewayAlert, GatewayAlerter } from "../alerts/gatewayAlerter";
import { gatewaySessionEventSchema, type GatewaySessionEvent } from "../mappers/whatsappPayload";

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
  | { status: "ignored"; reason: "malformed_payload" | "transitional_status" };

export interface HandleGatewaySessionEventDeps {
  alerter: GatewayAlerter;
}

export interface HandleGatewaySessionEvent {
  execute(payload: unknown): Promise<GatewaySessionEventOutcome>;
}

/**
 * React to an OpenWA session lifecycle webhook: raise an alert when the session stops being able
 * to receive athletes' messages, and say so when it is back. This is the real time half of the
 * INI-40 monitoring; the watchdog cron covers the case where the gateway is too dead to call us.
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

      const alert = alertFor(parsed.data);
      if (!alert) return { status: "ignored", reason: "transitional_status" };

      await deps.alerter.notify(alert);
      return alert.severity === "recovered" ? { status: "recovered" } : { status: "alerted", code: alert.code };
    }
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
