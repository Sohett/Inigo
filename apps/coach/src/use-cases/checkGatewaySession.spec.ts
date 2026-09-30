import { describe, it, expect, vi, afterEach } from "vitest";
import type { GatewayAlert, GatewaySession } from "../domain/whatsappGateway";
import { OpenWaApiError } from "../whatsapp/client";
import { createCheckGatewaySession, GatewayCheckFailure } from "./checkGatewaySession";

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

  // Linking again needs a human: a restart would only produce a fresh QR.
  it.each(["qr_ready", "action_required"])("alerts, without restarting, when the session is %s", async (status) => {
    const { check, notify, startSession } = build({
      getSession: async () => ({ id: SESSION, status, lastError: null })
    });

    await expect(check.execute()).resolves.toEqual({
      status: "unhealthy",
      reason: GatewayCheckFailure.SessionNotReady
    });
    expect(startSession).not.toHaveBeenCalled();
    expect(notify.mock.calls[0]?.[0].message).toContain(status);
  });

  it("alerts when the session is starting, with its status and last error", async () => {
    const { check, notify } = build({
      getSession: async () => ({ id: SESSION, status: "initializing", lastError: "Connection Closed" })
    });

    await expect(check.execute()).resolves.toEqual({
      status: "unhealthy",
      reason: GatewayCheckFailure.SessionNotReady
    });
    const alert = notify.mock.calls[0]?.[0];
    expect(alert?.message).toContain("initializing");
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

  describe("automatic restart", () => {
    // The most common outage: the device is still linked, only the engine is down.
    it.each(["disconnected", "failed"])("restarts a %s session once, and says so", async (status) => {
      const { check, notify, startSession } = build({
        getSession: async () => ({ id: SESSION, status, lastError: "Connection Closed" })
      });

      await expect(check.execute()).resolves.toEqual({
        status: "restarted",
        sessionId: SESSION,
        previousStatus: status
      });
      expect(startSession).toHaveBeenCalledTimes(1);
      expect(startSession).toHaveBeenCalledWith(SESSION);
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ source: "watchdog", code: "session_restarted", sessionId: SESSION })
      );
      expect(notify.mock.calls[0]?.[0].message).toContain("Connection Closed");
    });

    it("counts a start already in progress as restarted", async () => {
      const { check } = build({
        getSession: async () => ({ id: SESSION, status: "failed", lastError: null }),
        startSession: async () => "already_starting"
      });

      await expect(check.execute()).resolves.toMatchObject({ status: "restarted" });
    });

    it("alerts, without throwing, when the restart fails", async () => {
      const { check, notify } = build({
        getSession: async () => ({ id: SESSION, status: "failed", lastError: null }),
        startSession: async () => {
          throw new OpenWaApiError("WhatsApp gateway did not restart the session: HTTP 504", { status: 504 });
        }
      });

      await expect(check.execute()).resolves.toEqual({
        status: "unhealthy",
        reason: GatewayCheckFailure.SessionNotReady
      });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0]?.[0].message).toContain("relance automatique a échoué");
      expect(notify.mock.calls[0]?.[0].message).toContain("HTTP 504");
    });
  });
});
