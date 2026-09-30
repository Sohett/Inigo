import { describe, it, expect, vi, afterEach } from "vitest";
import type { GatewayAlert } from "../alerts/gatewayAlerter";
import { OpenWaApiError, type GatewaySession } from "../whatsapp/client";
import { createCheckGatewaySession, GatewayCheckFailure } from "./checkGatewaySession";

const SESSION = "gateway-session";

function build(options: {
  sessionId?: string | null;
  getSession?: () => Promise<GatewaySession | null>;
  resolveClient?: () => never;
}) {
  const notify = vi.fn(async (_alert: GatewayAlert) => undefined);
  const getSession = vi.fn(options.getSession ?? (async () => ({ id: SESSION, status: "ready", lastError: null })));
  const check = createCheckGatewaySession({
    gateway: {
      getSessionId: async () => (options.sessionId === undefined ? SESSION : options.sessionId),
      setSessionId: async () => undefined
    },
    resolveClient: options.resolveClient ?? (() => ({ getSession }) as never),
    alerter: { notify }
  });
  return { check, notify, getSession };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkGatewaySession", () => {
  it("is healthy, and silent, when the recorded session is ready", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { check, notify, getSession } = build({});

    await expect(check.execute()).resolves.toEqual({ status: "healthy", sessionId: SESSION });
    expect(getSession).toHaveBeenCalledWith(SESSION);
    expect(notify).not.toHaveBeenCalled();
  });

  it("alerts when no session is recorded, without calling the gateway", async () => {
    const { check, notify, getSession } = build({ sessionId: null });

    await expect(check.execute()).resolves.toEqual({
      status: "unhealthy",
      reason: GatewayCheckFailure.NoSessionRecorded
    });
    expect(getSession).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "down", source: "watchdog", code: "no_session_recorded" })
    );
  });

  it("alerts when the gateway no longer knows the session", async () => {
    const { check, notify } = build({ getSession: async () => null });

    await expect(check.execute()).resolves.toEqual({
      status: "unhealthy",
      reason: GatewayCheckFailure.SessionNotFound
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ code: "session_not_found", sessionId: SESSION }));
  });

  it("alerts when the session is not ready, with its status and last error", async () => {
    const { check, notify } = build({
      getSession: async () => ({ id: SESSION, status: "disconnected", lastError: "Connection Closed" })
    });

    await expect(check.execute()).resolves.toEqual({
      status: "unhealthy",
      reason: GatewayCheckFailure.SessionNotReady
    });
    const alert = notify.mock.calls[0]?.[0];
    expect(alert?.message).toContain("disconnected");
    expect(alert?.message).toContain("Connection Closed");
  });

  // The outage the watchdog exists for: a gateway too dead to answer must raise an alert, not
  // crash the check.
  it("alerts, without throwing, when the gateway does not answer", async () => {
    const { check, notify } = build({
      getSession: async () => {
        throw new OpenWaApiError("WhatsApp gateway did not answer (fetch failed).", { status: null });
      }
    });

    await expect(check.execute()).resolves.toEqual({
      status: "unhealthy",
      reason: GatewayCheckFailure.GatewayUnreachable
    });
    expect(notify.mock.calls[0]?.[0].message).toContain("did not answer");
  });

  it("alerts, without throwing, when the gateway is not configured", async () => {
    const { check, notify } = build({
      resolveClient: () => {
        throw new Error("WhatsApp gateway is not configured.");
      }
    });

    await expect(check.execute()).resolves.toEqual({
      status: "unhealthy",
      reason: GatewayCheckFailure.GatewayUnreachable
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
