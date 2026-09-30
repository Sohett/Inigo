/**
 * Coach-owned business model of the WhatsApp gateway's health (INI-40).
 *
 * Independent of the OpenWA wire shapes (same rule as `domain/athlete.ts` and `@inigo/db`): the
 * mapper and the client map the gateway's payloads onto these. Everything here is an id, a status
 * or a sentence, never a secret.
 */

/**
 * Every status an OpenWA session can have (OpenWA's own `SessionStatus`, a closed set).
 * `Ready` is the only one in which athletes' messages reach the coach.
 */
export const GatewaySessionStatus = {
  /** Created, never started. */
  Created: "created",
  /** The engine is starting: at boot, on a start, during a reconnect. Transitional. */
  Initializing: "initializing",
  /** WhatsApp wants the QR scanned: first link, or after an unlink. Needs a human. */
  QrReady: "qr_ready",
  /** QR scanned, linking in progress. Transitional. */
  Authenticating: "authenticating",
  /** Connected: messages flow. */
  Ready: "ready",
  /** Disconnected: a network or WhatsApp drop, or a manual stop. */
  Disconnected: "disconnected",
  /** WhatsApp wants an action (pairing code, …). Needs a human. */
  ActionRequired: "action_required",
  /** Every reconnect attempt failed. Terminal: OpenWA never restarts it by itself. */
  Failed: "failed"
} as const;

export type GatewaySessionStatus = (typeof GatewaySessionStatus)[keyof typeof GatewaySessionStatus];

const KNOWN_STATUSES: ReadonlySet<string> = new Set(Object.values(GatewaySessionStatus));

/** The status as a known enum value, or null for a status a newer gateway build introduced. */
export function toGatewaySessionStatus(raw: string): GatewaySessionStatus | null {
  return KNOWN_STATUSES.has(raw) ? (raw as GatewaySessionStatus) : null;
}

/** The OpenWA session webhooks the coach subscribes to. */
export const GatewaySessionEvent = {
  /** Every status change, a manual stop included. `{ sessionId, status }`. */
  Status: "session.status",
  /** An engine or WhatsApp side drop (never a manual stop). `{ sessionId, reason }`. */
  Disconnected: "session.disconnected",
  /** Every 5th failed reconnect attempt. `{ sessionId, attempts, nextDelayMs }`. */
  ReconnectLoop: "session.reconnect_loop",
  /** WhatsApp restricts the account, or lifts it. `{ sessionId, active, kind, code, expiresAt }`. */
  Restriction: "session.restriction"
} as const;

export type GatewaySessionEvent = (typeof GatewaySessionEvent)[keyof typeof GatewaySessionEvent];

/** A gateway session as the coach reads it. */
export interface GatewaySession {
  id: string;
  /** Raw OpenWA status; map it with `toGatewaySessionStatus`. */
  status: string;
  lastError: string | null;
}

/** How bad it is, which decides the Slack header and the log level. */
export const GatewayAlertSeverity = {
  /** Messages may no longer reach the coach; OpenWA or the watchdog may still fix it. */
  Down: "down",
  /** Messages do not reach the coach and only a human can fix it. */
  NeedsHuman: "needs_human",
  /** Messages reach the coach again. */
  Recovered: "recovered"
} as const;

export type GatewayAlertSeverity = (typeof GatewayAlertSeverity)[keyof typeof GatewayAlertSeverity];

/** Who noticed: OpenWA telling us through its webhook, or our own watchdog asking it. */
export const GatewayAlertSource = {
  Webhook: "webhook",
  Watchdog: "watchdog"
} as const;

export type GatewayAlertSource = (typeof GatewayAlertSource)[keyof typeof GatewayAlertSource];

export interface GatewayAlert {
  severity: GatewayAlertSeverity;
  source: GatewayAlertSource;
  /** Short, stable machine code (e.g. `session_disconnected`), for log search. */
  code: string;
  /** One human sentence, in English: what is wrong and, when known, what to do. */
  message: string;
  /** The gateway session concerned, when known. An infrastructure id, not a secret. */
  sessionId?: string;
}
