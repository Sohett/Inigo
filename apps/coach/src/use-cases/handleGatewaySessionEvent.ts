import type { GatewayAlerter } from "../alerts/gatewayAlerter";
import type { GatewayAlert } from "../domain/whatsappGateway";
import { gatewaySessionEventSchema, type GatewaySessionEvent } from "../mappers/whatsappPayload";
import type { WhatsappGatewayRepository } from "../repositories/whatsappGatewayRepository";

/**
 * Session statuses that need a human. `qr_ready` and `action_required` mean WhatsApp wants the
 * device linked again (QR or code); `failed` is terminal on OpenWA, nothing retries it.
 */
const STATUSES_NEEDING_A_HUMAN: ReadonlySet<string> = new Set(["qr_ready", "action_required", "failed"]);

export type GatewaySessionEventOutcome =
  | { status: "alerted"; event: string; code: string }
  | { status: "recovered"; event: string }
  | {
      status: "ignored";
      /** Absent only when the payload could not be read at all. */
      event?: string;
      /** The session status, for `session.status`: what makes a silence explainable in the logs. */
      sessionStatus?: string;
      reason: "malformed_payload" | "transitional_status" | "other_session" | "covered_by_status";
    };

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
      const name = event.event;
      const sessionStatus = event.event === "session.status" ? event.data.status : undefined;
      if (!(await isRecordedSession(deps.gateway, event.data.sessionId))) {
        if (sessionStatus !== "ready") return { status: "ignored", event: name, sessionStatus, reason: "other_session" };
        const alert = unrecordedSessionReady(event.data.sessionId);
        await deps.alerter.notify(alert);
        return { status: "alerted", event: name, code: alert.code };
      }

      // Every disconnection, a drop or a stop, ends in `session.status = disconnected`, which is
      // the one that alerts. A drop also sends `session.disconnected`: alerting on both would
      // double every drop, so its reason only goes to the logs.
      if (event.event === "session.disconnected") {
        console.info(`[coach] session disconnected reason=${event.data.reason ?? "unknown"}`);
        return { status: "ignored", event: name, reason: "covered_by_status" };
      }

      const alert = alertFor(event);
      if (!alert) return { status: "ignored", event: name, sessionStatus, reason: "transitional_status" };

      await deps.alerter.notify(alert);
      return alert.severity === "recovered"
        ? { status: "recovered", event: name }
        : { status: "alerted", event: name, code: alert.code };
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
      return null; // handled before: covered by `session.status = disconnected`
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
      if (event.data.status === "disconnected") {
        return {
          severity: "down",
          source: "webhook",
          code: "session_disconnected",
          message:
            "La session WhatsApp est déconnectée. Après une coupure, OpenWA tente de se reconnecter ; " +
            "après un arrêt, le watchdog la relancera à son prochain passage. " +
            "Un message suivra dès qu'elle repasse en ready.",
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
