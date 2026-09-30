import type { GatewayAlerter } from "../alerts/gatewayAlerter";
import {
  GatewayAlertSeverity,
  GatewayAlertSource,
  GatewaySessionStatus,
  toGatewaySessionStatus,
  type GatewaySession
} from "../domain/whatsappGateway";
import type { WhatsappGatewayRepository } from "../repositories/whatsappGatewayRepository";
import type { OpenWaClient } from "../whatsapp/client";
import type { ResolveOpenWaClient } from "../whatsapp/resolveClient";

/** What the watchdog does about the status it read. */
export const WatchdogAction = {
  /** `ready`: nothing to do. */
  None: "none",
  /** Still linked, engine stopped: one `POST /start` fixes it. */
  Restart: "restart",
  /** WhatsApp wants the device linked again: only a human can. */
  AskHuman: "ask_human",
  /** Stuck in a transitional or unknown status: alert, don't touch. */
  Alert: "alert"
} as const;

export type WatchdogAction = (typeof WatchdogAction)[keyof typeof WatchdogAction];

/** Every alert the watchdog can raise, as a stable code for log search. */
export const WatchdogAlertCode = {
  NoSessionRecorded: "no_session_recorded",
  SessionNotFound: "session_not_found",
  GatewayUnreachable: "gateway_unreachable",
  SessionRestarted: "session_restarted",
  RestartFailed: "restart_failed",
  SessionNeedsHuman: "session_needs_human",
  SessionStuck: "session_stuck"
} as const;

export type WatchdogAlertCode = (typeof WatchdogAlertCode)[keyof typeof WatchdogAlertCode];

export type WatchdogOutcome =
  | { status: "healthy"; sessionId: string }
  | { status: "restarted"; sessionId: string; previousStatus: string }
  | { status: "alerted"; code: WatchdogAlertCode };

/** The result of reading the recorded session from the gateway. */
type SessionRead =
  | { kind: "found"; client: OpenWaClient; session: GatewaySession }
  | { kind: "not_found" }
  | { kind: "unreachable"; error: string };

export interface CheckGatewaySessionDeps {
  gateway: WhatsappGatewayRepository;
  resolveClient: ResolveOpenWaClient;
  alerter: GatewayAlerter;
}

export interface CheckGatewaySession {
  execute(): Promise<WatchdogOutcome>;
}

/**
 * The watchdog (INI-40), run by the Vercel cron: read the session the coach sends through, straight
 * from the gateway, and act on its status (`decideWatchdogAction`). It covers what the session
 * webhooks cannot report (a gateway too dead to call anyone) and restarts a session that is merely
 * stopped or failed.
 *
 * Restarting only here, never from the webhook, is deliberate: a start that fails at once would turn
 * start → failed → start into a loop, where the cron's own schedule is the rate limit.
 *
 * Nothing throws on the outage it watches for; only the Neon read may, and the route turns that
 * into a 500 Vercel records.
 */
export function createCheckGatewaySession(deps: CheckGatewaySessionDeps): CheckGatewaySession {
  const report = async (
    severity: GatewayAlertSeverity,
    code: WatchdogAlertCode,
    message: string,
    sessionId?: string
  ): Promise<WatchdogOutcome> => {
    await deps.alerter.notify({ severity, source: GatewayAlertSource.Watchdog, code, message, sessionId });
    return { status: "alerted", code };
  };

  return {
    async execute(): Promise<WatchdogOutcome> {
      const sessionId = await deps.gateway.getSessionId();
      if (!sessionId) {
        return report(GatewayAlertSeverity.Down, WatchdogAlertCode.NoSessionRecorded,
          "No gateway session is recorded: set it in the admin, or the coach cannot reply.");
      }

      const read = await readSession(deps.resolveClient, sessionId);
      switch (read.kind) {
        case "unreachable":
          return report(GatewayAlertSeverity.Down, WatchdogAlertCode.GatewayUnreachable,
            `The OpenWA gateway is not answering properly: ${read.error}`, sessionId);
        case "not_found":
          return report(GatewayAlertSeverity.Down, WatchdogAlertCode.SessionNotFound,
            "The recorded session no longer exists on OpenWA. Link WhatsApp again, then update the session in the admin.", sessionId);
        case "found":
          return act(read.client, read.session);
      }
    }
  };

  async function act(client: OpenWaClient, session: GatewaySession): Promise<WatchdogOutcome> {
    const detail = session.lastError ? ` (${session.lastError})` : "";
    switch (decideWatchdogAction(session.status)) {
      case WatchdogAction.None:
        console.info(`[coach] watchdog: gateway session ${session.id} is ready`);
        return { status: "healthy", sessionId: session.id };
      case WatchdogAction.Restart:
        return restart(client, session, detail);
      case WatchdogAction.AskHuman:
        return report(GatewayAlertSeverity.NeedsHuman, WatchdogAlertCode.SessionNeedsHuman,
          `The session is \`${session.status}\`${detail}: WhatsApp must be linked again on the OpenWA dashboard.`, session.id);
      case WatchdogAction.Alert:
        return report(GatewayAlertSeverity.Down, WatchdogAlertCode.SessionStuck,
          `The session is stuck in \`${session.status}\`${detail}. Check the OpenWA dashboard.`, session.id);
    }
  }

  async function restart(client: OpenWaClient, session: GatewaySession, detail: string): Promise<WatchdogOutcome> {
    try {
      await client.startSession(session.id);
    } catch (error) {
      return report(GatewayAlertSeverity.Down, WatchdogAlertCode.RestartFailed,
        `The session is \`${session.status}\`${detail} and the automatic restart failed: ${errorText(error)}. Check the OpenWA dashboard.`, session.id);
    }
    await deps.alerter.notify({
      severity: GatewayAlertSeverity.Down,
      source: GatewayAlertSource.Watchdog,
      code: WatchdogAlertCode.SessionRestarted,
      message: `The session was \`${session.status}\`${detail}; the watchdog restarted it. A recovery message follows once it is ready, another alert otherwise.`,
      sessionId: session.id
    });
    return { status: "restarted", sessionId: session.id, previousStatus: session.status };
  }
}

/** One line per OpenWA status: what the watchdog does about it. */
export function decideWatchdogAction(rawStatus: string): WatchdogAction {
  const status = toGatewaySessionStatus(rawStatus);
  if (!status) return WatchdogAction.Alert;

  switch (status) {
    case GatewaySessionStatus.Ready:
      return WatchdogAction.None;
    case GatewaySessionStatus.Disconnected:
    case GatewaySessionStatus.Failed:
      return WatchdogAction.Restart;
    case GatewaySessionStatus.QrReady:
    case GatewaySessionStatus.ActionRequired:
      return WatchdogAction.AskHuman;
    case GatewaySessionStatus.Created:
    case GatewaySessionStatus.Initializing:
    case GatewaySessionStatus.Authenticating:
      return WatchdogAction.Alert;
  }
}

/** Read the session from the gateway; a breakdown becomes a value, never an exception. */
async function readSession(resolveClient: ResolveOpenWaClient, sessionId: string): Promise<SessionRead> {
  try {
    const client = resolveClient();
    const session = await client.getSession(sessionId);
    return session ? { kind: "found", client, session } : { kind: "not_found" };
  } catch (error) {
    return { kind: "unreachable", error: errorText(error) };
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
