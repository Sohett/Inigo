import { describe, it, expect, vi, afterEach } from "vitest";
import { GatewayAlertSeverity, type GatewayAlert } from "../domain/whatsappGateway";
import { createHandleGatewaySessionEvent, SessionEventIgnoreReason } from "./handleGatewaySessionEvent";

const SESSION = "gateway-session";
const OTHER = "old-or-new-session";

/** OpenWA's standard webhook envelope around a session event. */
function envelope(event: string, data: Record<string, unknown>, sessionId = SESSION) {
  return {
    event,
    timestamp: "2026-09-30T12:00:00.000Z",
    sessionId,
    idempotencyKey: "idem_1",
    deliveryId: "dlv_1",
    data: { ...data, sessionId }
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleGatewaySessionEvent", () => {
  // The product table of INI-40, one row per OpenWA status of the recorded session.
  describe("session.status of the recorded session", () => {
    it.each([
      ["ready", GatewayAlertSeverity.Recovered, "session_ready"],
      // A manual stop sends ONLY this status: it must alert (the production miss behind #41).
      ["disconnected", GatewayAlertSeverity.Down, "session_disconnected"],
      ["failed", GatewayAlertSeverity.Down, "session_failed"],
      ["qr_ready", GatewayAlertSeverity.NeedsHuman, "session_qr_ready"],
      ["action_required", GatewayAlertSeverity.NeedsHuman, "session_action_required"]
    ])("%s → %s alert %s", async (status, severity, code) => {
      const { handle, notify } = build();

      await expect(handle.execute(envelope("session.status", { status }))).resolves.toEqual({
        status: "notified",
        event: "session.status",
        code
      });
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ severity, code, source: "webhook", sessionId: SESSION })
      );
    });

    it.each(["created", "initializing", "authenticating"])("%s → no alert (transitional)", async (status) => {
      const { handle, notify } = build();

      await expect(handle.execute(envelope("session.status", { status }))).resolves.toEqual({
        status: "ignored",
        event: "session.status",
        reason: SessionEventIgnoreReason.TransitionalStatus,
        detail: status
      });
      expect(notify).not.toHaveBeenCalled();
    });

    it("an unknown status → no alert, the status is kept for the logs", async () => {
      const { handle, notify } = build();

      await expect(handle.execute(envelope("session.status", { status: "some_future_status" }))).resolves.toEqual({
        status: "ignored",
        event: "session.status",
        reason: SessionEventIgnoreReason.UnknownStatus,
        detail: "some_future_status"
      });
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe("the other session events of the recorded session", () => {
    it("session.disconnected → down alert carrying the reason", async () => {
      const { handle, notify } = build();

      await expect(handle.execute(envelope("session.disconnected", { reason: "conflict" }))).resolves.toEqual({
        status: "notified",
        event: "session.disconnected",
        code: "session_dropped"
      });
      expect(notify.mock.calls[0]?.[0]).toMatchObject({ severity: GatewayAlertSeverity.Down });
      expect(notify.mock.calls[0]?.[0].message).toContain("conflict");
    });

    it("session.reconnect_loop → down alert carrying the attempt count", async () => {
      const { handle, notify } = build();

      await expect(
        handle.execute(envelope("session.reconnect_loop", { attempts: 10, nextDelayMs: 60000 }))
      ).resolves.toMatchObject({ status: "notified", code: "session_reconnect_loop" });
      expect(notify.mock.calls[0]?.[0].message).toContain("10 attempts");
    });

    it("session.restriction active → down alert with the kind and the end date", async () => {
      const { handle, notify } = build();

      await expect(
        handle.execute(
          envelope("session.restriction", {
            active: true,
            kind: "reachout_timelock",
            code: "BIZ_QUALITY",
            expiresAt: "2026-10-02T00:00:00.000Z"
          })
        )
      ).resolves.toMatchObject({ status: "notified", code: "session_restricted" });
      const message = notify.mock.calls[0]?.[0].message ?? "";
      expect(message).toContain("reachout_timelock (BIZ_QUALITY)");
      expect(message).toContain("2026-10-02");
    });

    it("session.restriction lifted → recovered", async () => {
      const { handle, notify } = build();

      await expect(
        handle.execute(envelope("session.restriction", { active: false, kind: "reachout_timelock", expiresAt: null }))
      ).resolves.toMatchObject({ status: "notified", code: "session_restriction_lifted" });
      expect(notify.mock.calls[0]?.[0].severity).toBe(GatewayAlertSeverity.Recovered);
    });
  });

  describe("another session than the recorded one", () => {
    // After a re-pairing the old session keeps failing and disconnecting: noise, not an outage.
    it.each([
      ["session.status", { status: "disconnected" }],
      ["session.status", { status: "failed" }],
      ["session.disconnected", { reason: "logout" }],
      ["session.reconnect_loop", { attempts: 5 }],
      ["session.restriction", { active: true, kind: "tos_block" }]
    ])("%s %o → no alert", async (event, data) => {
      const { handle, notify } = build();

      await expect(handle.execute(envelope(event, data, OTHER))).resolves.toMatchObject({
        status: "ignored",
        reason: SessionEventIgnoreReason.OtherSession
      });
      expect(notify).not.toHaveBeenCalled();
    });

    // The coach still sends through the old session: it stays mute until the admin is updated.
    it("ready → needs human: update the session in the admin", async () => {
      const { handle, notify } = build();

      await expect(handle.execute(envelope("session.status", { status: "ready" }, OTHER))).resolves.toMatchObject({
        status: "notified",
        code: "unrecorded_session_ready"
      });
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ severity: GatewayAlertSeverity.NeedsHuman, sessionId: OTHER })
      );
    });

    it("ready while no session is recorded → needs human", async () => {
      const { handle } = build(async () => null);

      await expect(handle.execute(envelope("session.status", { status: "ready" }))).resolves.toMatchObject({
        code: "unrecorded_session_ready"
      });
    });
  });

  // An outage must fail loud: a Neon hiccup never silences an alert.
  it("still alerts when the recorded session cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handle, notify } = build(async () => {
      throw new Error("neon down");
    });

    await expect(handle.execute(envelope("session.status", { status: "disconnected" }))).resolves.toMatchObject({
      code: "session_disconnected"
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an unsubscribed session event", envelope("session.qr", { qr: "data:image/png;base64,..." })],
    ["a session event without data", { event: "session.status" }],
    ["a reconnect loop without attempts", envelope("session.reconnect_loop", {})],
    ["a restriction without active", envelope("session.restriction", { kind: "tos_block" })]
  ])("ignores %s as malformed", async (_label, payload) => {
    const { handle, notify } = build();

    await expect(handle.execute(payload)).resolves.toEqual({
      status: "ignored",
      reason: SessionEventIgnoreReason.MalformedPayload
    });
    expect(notify).not.toHaveBeenCalled();
  });
});
