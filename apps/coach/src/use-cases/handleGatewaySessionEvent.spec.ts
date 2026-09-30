import { describe, it, expect, vi } from "vitest";
import type { GatewayAlert } from "../domain/whatsappGateway";
import { createHandleGatewaySessionEvent } from "./handleGatewaySessionEvent";

const SESSION = "gateway-session";

/** OpenWA's standard webhook envelope around a session event. */
function envelope(event: string, data: Record<string, unknown>) {
  return {
    event,
    timestamp: "2026-09-30T12:00:00.000Z",
    sessionId: SESSION,
    idempotencyKey: "idem_1",
    deliveryId: "dlv_1",
    data: { sessionId: SESSION, ...data }
  };
}

function build(getSessionId: () => Promise<string | null> = async () => SESSION) {
  const notify = vi.fn(async (_alert: GatewayAlert) => undefined);
  const handle = createHandleGatewaySessionEvent({
    alerter: { notify },
    gateway: { getSessionId, setSessionId: async () => undefined }
  });
  return { handle, notify };
}

describe("handleGatewaySessionEvent", () => {
  it("alerts on session.disconnected, with the reason", async () => {
    const { handle, notify } = build();

    await expect(handle.execute(envelope("session.disconnected", { reason: "conflict" }))).resolves.toEqual({
      status: "alerted",
      code: "session_disconnected"
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "down", source: "webhook", sessionId: SESSION })
    );
    expect(notify.mock.calls[0]?.[0].message).toContain("conflict");
  });

  it("alerts on session.reconnect_loop, with the attempt count", async () => {
    const { handle, notify } = build();

    await expect(
      handle.execute(envelope("session.reconnect_loop", { attempts: 10, nextDelayMs: 60000 }))
    ).resolves.toEqual({ status: "alerted", code: "session_reconnect_loop" });
    expect(notify.mock.calls[0]?.[0].message).toContain("10");
  });

  it.each(["qr_ready", "action_required", "failed"])("alerts when the status becomes %s", async (status) => {
    const { handle, notify } = build();

    await expect(handle.execute(envelope("session.status", { status }))).resolves.toEqual({
      status: "alerted",
      code: `session_${status}`
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ severity: "down" }));
  });

  it("reports the recovery when the status becomes ready", async () => {
    const { handle, notify } = build();

    await expect(handle.execute(envelope("session.status", { status: "ready" }))).resolves.toEqual({
      status: "recovered"
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ severity: "recovered", code: "session_ready" }));
  });

  // `disconnected` is covered by `session.disconnected`; alerting on both would double every drop.
  it.each(["disconnected", "initializing", "authenticating", "created", "some_future_status"])(
    "stays quiet on the %s status",
    async (status) => {
      const { handle, notify } = build();

      await expect(handle.execute(envelope("session.status", { status }))).resolves.toEqual({
        status: "ignored",
        reason: "transitional_status"
      });
      expect(notify).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["an unwatched session event", envelope("session.qr", { qr: "data:image/png;base64,..." })],
    ["a session event without data", { event: "session.status" }],
    ["a reconnect loop without attempts", envelope("session.reconnect_loop", {})]
  ])("ignores %s as malformed", async (_label, payload) => {
    const { handle, notify } = build();

    await expect(handle.execute(payload)).resolves.toEqual({ status: "ignored", reason: "malformed_payload" });
    expect(notify).not.toHaveBeenCalled();
  });

  describe("against the session recorded in Neon", () => {
    const OTHER = "old-or-new-session";
    const other = (event: string, data: Record<string, unknown>) => ({
      ...envelope(event, data),
      data: { ...data, sessionId: OTHER }
    });

    // After a re-pairing the old session keeps failing and disconnecting: noise, not an outage.
    it.each([
      ["session.disconnected", { reason: "logout" }],
      ["session.reconnect_loop", { attempts: 5 }],
      ["session.status", { status: "failed" }]
    ])("ignores %s from another session", async (event, data) => {
      const { handle, notify } = build();

      await expect(handle.execute(other(event, data))).resolves.toEqual({
        status: "ignored",
        reason: "other_session"
      });
      expect(notify).not.toHaveBeenCalled();
    });

    // The coach still sends through the old session: it stays mute until the admin is updated.
    it("alerts, rather than reporting a recovery, when another session becomes ready", async () => {
      const { handle, notify } = build();

      await expect(handle.execute(other("session.status", { status: "ready" }))).resolves.toEqual({
        status: "alerted",
        code: "unrecorded_session_ready"
      });
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "down", sessionId: OTHER, code: "unrecorded_session_ready" })
      );
    });

    it("asks for the admin when a session becomes ready and none is recorded", async () => {
      const { handle } = build(async () => null);

      await expect(handle.execute(envelope("session.status", { status: "ready" }))).resolves.toEqual({
        status: "alerted",
        code: "unrecorded_session_ready"
      });
    });

    // An outage must fail loud: a Neon hiccup never silences an alert.
    it("still alerts when the recorded session cannot be read", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { handle, notify } = build(async () => {
        throw new Error("neon down");
      });

      await expect(handle.execute(envelope("session.disconnected", { reason: "conflict" }))).resolves.toEqual({
        status: "alerted",
        code: "session_disconnected"
      });
      expect(notify).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
    });
  });
});
