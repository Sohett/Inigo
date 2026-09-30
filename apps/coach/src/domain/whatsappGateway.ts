/**
 * Coach-owned business model of the WhatsApp gateway's health (INI-40).
 *
 * Independent of the OpenWA wire shapes (same rule as `domain/athlete.ts` and `@inigo/db`): the
 * client in `whatsapp/client` maps the gateway's answer onto `GatewaySession`. Everything here is
 * an id, a status or a sentence, never a secret.
 */

/** A gateway session as the coach sees it. */
export interface GatewaySession {
  id: string;
  /** OpenWA `SessionStatus`: `ready` is the only state in which messages flow. */
  status: string;
  lastError: string | null;
}

/**
 * What happened to the gateway session. `down` means athletes' messages may no longer reach the
 * coach; `recovered` means they do again.
 */
export type GatewayAlertSeverity = "down" | "recovered";

/** Who noticed: OpenWA telling us through its webhook, or our own watchdog asking it. */
export type GatewayAlertSource = "webhook" | "watchdog";

export interface GatewayAlert {
  severity: GatewayAlertSeverity;
  source: GatewayAlertSource;
  /** Short, stable machine code (e.g. `session_disconnected`), for log search. */
  code: string;
  /** One human sentence: what is wrong and, when known, what to do. */
  message: string;
  /** The gateway session concerned, when known. An infrastructure id, not a secret. */
  sessionId?: string;
}
