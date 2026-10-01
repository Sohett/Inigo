import type { GatewayAlerter } from "../alerts/gatewayAlerter";
import {
  GatewayAlertSeverity,
  GatewayAlertSource,
  GatewaySessionEvent,
  GatewaySessionStatus,
  toGatewaySessionStatus,
  type GatewayAlert
} from "../domain/whatsappGateway";
import { gatewaySessionEventSchema, type GatewaySessionEventPayload } from "../mappers/whatsappPayload";
import type { WhatsappGatewayRepository } from "../repositories/whatsappGatewayRepository";

/** Every alert the session webhooks can raise, as a stable code for log search. */
export const SessionAlertCode = {
  SessionDisconnected: "session_disconnected",
  SessionFailed: "session_failed",
  SessionQrReady: "session_qr_ready",
  SessionActionRequired: "session_action_required",
  SessionDropped: "session_dropped",
  SessionReconnectLoop: "session_reconnect_loop",
  SessionRestricted: "session_restricted",
  SessionRestrictionLifted: "session_restriction_lifted",
  UnrecordedSessionReady: "unrecorded_session_ready"
} as const;

export type SessionAlertCode = (typeof SessionAlertCode)[keyof typeof SessionAlertCode];

/** Why a session event raised no alert. Each is a normal outcome, logged by the route. */
export const SessionEventIgnoreReason = {
  MalformedPayload: "malformed_payload",
  /** `created`, `initializing`, `authenticating`: the session is on its way somewhere. */
  TransitionalStatus: "transitional_status",
  /** `ready`: nothing to act on (INI-41). A real outage already alerted; a silent reconnect never did. */
  SessionReady: "session_ready",
  /** A status a newer gateway build introduced. Logged with its value, never guessed at. */
  UnknownStatus: "unknown_status",
  /** An event of a session the coach does not send through (e.g. the old one after a re-pairing). */
  OtherSession: "other_session"
} as const;

export type SessionEventIgnoreReason = (typeof SessionEventIgnoreReason)[keyof typeof SessionEventIgnoreReason];

export type GatewaySessionEventOutcome =
  | { status: "notified"; event: string; code: SessionAlertCode }
  | { status: "ignored"; event?: string; reason: SessionEventIgnoreReason; detail?: string };

/** What one event means: an alert to send, or a reason to stay quiet. */
type Decision =
  | { kind: "alert"; code: SessionAlertCode; alert: GatewayAlert }
  | { kind: "ignore"; reason: SessionEventIgnoreReason; detail?: string };

export interface HandleGatewaySessionEventDeps {
  alerter: GatewayAlerter;
  /** The session the coach sends through: only its events say whether athletes are heard. */
  gateway: WhatsappGatewayRepository;
}

export interface HandleGatewaySessionEvent {
  execute(payload: unknown): Promise<GatewaySessionEventOutcome>;
}

/**
 * React to an OpenWA session webhook (INI-40): tell a human, on Slack, when the session the coach
 * sends through stops receiving athletes' messages. Only what needs acting on: its return to
 * `ready` is logged, never posted (INI-41). The product rules are the
 * `decide…` functions below, one `switch` each.
 *
 * The alerter never throws, so the webhook always answers 200 and BullMQ never replays an event
 * into a second alert.
 */
export function createHandleGatewaySessionEvent(
  deps: HandleGatewaySessionEventDeps
): HandleGatewaySessionEvent {
  return {
    async execute(payload: unknown): Promise<GatewaySessionEventOutcome> {
      const parsed = gatewaySessionEventSchema.safeParse(payload);
      if (!parsed.success) return { status: "ignored", reason: SessionEventIgnoreReason.MalformedPayload };

      const event = parsed.data;
      const recorded = await isRecordedSession(deps.gateway, event.data.sessionId);
      const decision = recorded ? decideForRecordedSession(event) : decideForOtherSession(event);
      if (decision.kind === "ignore") {
        return { status: "ignored", event: event.event, reason: decision.reason, detail: decision.detail };
      }

      await deps.alerter.notify(decision.alert);
      return { status: "notified", event: event.event, code: decision.code };
    }
  };
}

/** The session the coach sends through: every event is a product decision. */
function decideForRecordedSession(event: GatewaySessionEventPayload): Decision {
  const sessionId = event.data.sessionId;
  switch (event.event) {
    case GatewaySessionEvent.Status:
      return decideForStatus(event.data.status, sessionId);
    case GatewaySessionEvent.Disconnected:
      return alert(GatewayAlertSeverity.Down, SessionAlertCode.SessionDropped, sessionId,
        `The WhatsApp session dropped (reason: ${event.data.reason ?? "unknown"}). OpenWA is trying to reconnect it.`);
    case GatewaySessionEvent.ReconnectLoop:
      return alert(GatewayAlertSeverity.Down, SessionAlertCode.SessionReconnectLoop, sessionId,
        `OpenWA still cannot reconnect the session after ${event.data.attempts} attempts.`);
    case GatewaySessionEvent.Restriction:
      return decideForRestriction(event.data, sessionId);
  }
}

/** One line per OpenWA status: this table is the product rule of INI-40. */
function decideForStatus(rawStatus: string, sessionId: string): Decision {
  const status = toGatewaySessionStatus(rawStatus);
  if (!status) return ignore(SessionEventIgnoreReason.UnknownStatus, rawStatus);

  switch (status) {
    case GatewaySessionStatus.Ready:
      return ignore(SessionEventIgnoreReason.SessionReady);
    case GatewaySessionStatus.Disconnected:
      return alert(GatewayAlertSeverity.Down, SessionAlertCode.SessionDisconnected, sessionId,
        "The WhatsApp session is disconnected. After a drop OpenWA reconnects it; after a stop the watchdog restarts it on its next run.");
    case GatewaySessionStatus.Failed:
      return alert(GatewayAlertSeverity.Down, SessionAlertCode.SessionFailed, sessionId,
        "Every reconnect attempt failed and OpenWA gave up. The watchdog restarts the session on its next run.");
    case GatewaySessionStatus.QrReady:
      return alert(GatewayAlertSeverity.NeedsHuman, SessionAlertCode.SessionQrReady, sessionId,
        "WhatsApp unlinked the session: scan the QR code on the OpenWA dashboard.");
    case GatewaySessionStatus.ActionRequired:
      return alert(GatewayAlertSeverity.NeedsHuman, SessionAlertCode.SessionActionRequired, sessionId,
        "WhatsApp requires an action (pairing code or similar) on the OpenWA dashboard.");
    case GatewaySessionStatus.Created:
    case GatewaySessionStatus.Initializing:
    case GatewaySessionStatus.Authenticating:
      return ignore(SessionEventIgnoreReason.TransitionalStatus, status);
  }
}

type RestrictionData = Extract<GatewaySessionEventPayload, { event: "session.restriction" }>["data"];

function decideForRestriction(data: RestrictionData, sessionId: string): Decision {
  const what = `${data.kind ?? "unknown"}${data.code ? ` (${data.code})` : ""}`;
  if (!data.active) {
    return alert(GatewayAlertSeverity.Recovered, SessionAlertCode.SessionRestrictionLifted, sessionId,
      `WhatsApp lifted the restriction on the account: ${what}.`);
  }
  const until = data.expiresAt ? ` until ${data.expiresAt}` : "";
  return alert(GatewayAlertSeverity.Down, SessionAlertCode.SessionRestricted, sessionId,
    `WhatsApp restricted the account${until}: ${what}.`);
}

/**
 * Another session than the one the coach sends through. Its drops are noise (the old session after
 * a re-pairing); but a new session reaching `ready` means the coach is still sending through the
 * old one, so it stays mute until the admin is updated.
 */
function decideForOtherSession(event: GatewaySessionEventPayload): Decision {
  if (event.event !== GatewaySessionEvent.Status) return ignore(SessionEventIgnoreReason.OtherSession);
  if (event.data.status !== GatewaySessionStatus.Ready) return ignore(SessionEventIgnoreReason.OtherSession);
  return alert(GatewayAlertSeverity.NeedsHuman, SessionAlertCode.UnrecordedSessionReady, event.data.sessionId,
    "A WhatsApp session is connected, but it is not the one the coach sends through. Update the session in the admin, or the coach cannot reply.");
}

/** Whether the event concerns the recorded session. Unknown (Neon unreadable) counts as yes: fail loud. */
async function isRecordedSession(gateway: WhatsappGatewayRepository, sessionId: string): Promise<boolean> {
  try {
    return (await gateway.getSessionId()) === sessionId;
  } catch (error) {
    console.error("[coach] session event: could not read the recorded gateway session", error);
    return true;
  }
}

function alert(severity: GatewayAlertSeverity, code: SessionAlertCode, sessionId: string, message: string): Decision {
  return { kind: "alert", code, alert: { severity, source: GatewayAlertSource.Webhook, code, message, sessionId } };
}

function ignore(reason: SessionEventIgnoreReason, detail?: string): Decision {
  return { kind: "ignore", reason, detail };
}
