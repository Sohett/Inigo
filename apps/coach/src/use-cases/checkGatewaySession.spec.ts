import { describe, it, expect, vi, afterEach } from "vitest";
import { GatewayAlertSeverity, type GatewayAlert, type GatewaySession } from "../domain/whatsappGateway";
import { OpenWaApiError } from "../whatsapp/client";
import {
  createCheckGatewaySession,
  decideWatchdogAction,
  WatchdogAction,
  WatchdogAlertCode
} from "./checkGatewaySession";

const SESSION = "gateway-session";

function build(options: {
  sessionId?: string | null;
  getSession?: () => Promise<GatewaySession | null>;
  startSession?: () => Promise<"started" | "already_starting">;
  resolveClient?: () => never;
}) {
  const notify = vi.fn(async (_alert: GatewayAlert) => undefined);
  const getSession = vi.fn(options.getSession ?? (async () => ({ id: SESSION, status: "ready", lastError: null })));
  const startSession = vi.fn(options.startSession ?? (async () => "started" as const));
  const check = createCheckGatewaySession({
    gateway: {
      getSessionId: async () => (options.sessionId === undefined ? SESSION : options.sessionId),
      setSessionId: async () => undefined
    },
    resolveClient: options.resolveClient ?? (() => ({ getSession, startSession }) as never),
    alerter: { notify }
  });
  return { check, notify, getSession, startSession };
}

function withStatus(status: string, lastError: string | null = null) {
  return async (): Promise<GatewaySession> => ({ id: SESSION, status, lastError });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// The product table of the watchdog, one row per OpenWA status.
describe("decideWatchdogAction", () => {
  it.each([
    ["ready", WatchdogAction.None],
    ["disconnected", WatchdogAction.Restart],
    ["failed", WatchdogAction.Restart],
    ["qr_ready", WatchdogAction.AskHuman],
    ["action_required", WatchdogAction.AskHuman],
    ["created", WatchdogAction.Alert],
    ["initializing", WatchdogAction.Alert],
    ["authenticating", WatchdogAction.Alert],
    ["some_future_status", WatchdogAction.Alert]
  ])("%s → %s", (status, action) => {
    expect(decideWatchdogAction(status)).toBe(action);
  });
});

describe("checkGatewaySession", () => {
  it("ready → healthy, no alert", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { check, notify, getSession } = build({});

    await expect(check.execute()).resolves.toEqual({ status: "healthy", sessionId: SESSION });
    expect(getSession).toHaveBeenCalledWith(SESSION);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(["disconnected", "failed"])("%s → one restart, and says so", async (status) => {
    const { check, notify, startSession } = build({ getSession: withStatus(status, "Connection Closed") });

    await expect(check.execute()).resolves.toEqual({ status: "restarted", sessionId: SESSION, previousStatus: status });
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalledWith(SESSION);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ source: "watchdog", code: WatchdogAlertCode.SessionRestarted })
    );
    expect(notify.mock.calls[0]?.[0].message).toContain("Connection Closed");
  });

  it("a start already in progress counts as restarted", async () => {
    const { check } = build({ getSession: withStatus("failed"), startSession: async () => "already_starting" });

    await expect(check.execute()).resolves.toMatchObject({ status: "restarted" });
  });

  it("a restart that fails → alert, without throwing", async () => {
    const { check, notify } = build({
      getSession: withStatus("failed"),
      startSession: async () => {
        throw new OpenWaApiError("WhatsApp gateway did not restart the session: HTTP 504", { status: 504 });
      }
    });

    await expect(check.execute()).resolves.toEqual({ status: "alerted", code: WatchdogAlertCode.RestartFailed });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0].message).toContain("HTTP 504");
  });

  // Linking again needs a human: a restart would only produce a fresh QR.
  it.each(["qr_ready", "action_required"])("%s → needs human, no restart", async (status) => {
    const { check, notify, startSession } = build({ getSession: withStatus(status) });

    await expect(check.execute()).resolves.toEqual({ status: "alerted", code: WatchdogAlertCode.SessionNeedsHuman });
    expect(startSession).not.toHaveBeenCalled();
    expect(notify.mock.calls[0]?.[0].severity).toBe(GatewayAlertSeverity.NeedsHuman);
  });

  it.each(["initializing", "some_future_status"])("%s → stuck alert, no restart", async (status) => {
    const { check, notify, startSession } = build({ getSession: withStatus(status, "boom") });

    await expect(check.execute()).resolves.toEqual({ status: "alerted", code: WatchdogAlertCode.SessionStuck });
    expect(startSession).not.toHaveBeenCalled();
    expect(notify.mock.calls[0]?.[0].message).toContain(status);
    expect(notify.mock.calls[0]?.[0].message).toContain("boom");
  });

  it("no session recorded → alert, the gateway is not called", async () => {
    const { check, notify, getSession } = build({ sessionId: null });

    await expect(check.execute()).resolves.toEqual({ status: "alerted", code: WatchdogAlertCode.NoSessionRecorded });
    expect(getSession).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("the gateway no longer knows the session → alert", async () => {
    const { check } = build({ getSession: async () => null });

    await expect(check.execute()).resolves.toEqual({ status: "alerted", code: WatchdogAlertCode.SessionNotFound });
  });

  // The outage the watchdog exists for: a gateway too dead to answer raises an alert, not a crash.
  it("the gateway does not answer → alert, without throwing", async () => {
    const { check, notify } = build({
      getSession: async () => {
        throw new OpenWaApiError("WhatsApp gateway did not answer (fetch failed).", { status: null });
      }
    });

    await expect(check.execute()).resolves.toEqual({ status: "alerted", code: WatchdogAlertCode.GatewayUnreachable });
    expect(notify.mock.calls[0]?.[0].message).toContain("did not answer");
  });

  it("the gateway is not configured → alert, without throwing", async () => {
    const { check } = build({
      resolveClient: () => {
        throw new Error("WhatsApp gateway is not configured.");
      }
    });

    await expect(check.execute()).resolves.toEqual({ status: "alerted", code: WatchdogAlertCode.GatewayUnreachable });
  });
});
