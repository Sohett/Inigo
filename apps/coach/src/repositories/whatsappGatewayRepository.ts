/**
 * Port for the WhatsApp gateway configuration.
 *
 * Only the session the coach sends through, because it is the only part that changes by
 * itself: every WhatsApp re-pairing (session dropped, QR rescanned) gives a new one. It lives
 * in the database so the admin can fix it in a form, instead of in the environment where it
 * would need a redeploy to restore the coach's voice.
 */
export interface WhatsappGatewayRepository {
  /** The recorded session, or null when none has been set yet. */
  getSessionId(): Promise<string | null>;
  /** Record the session. Idempotent, overwrites whatever was there. */
  setSessionId(sessionId: string): Promise<void>;
}
