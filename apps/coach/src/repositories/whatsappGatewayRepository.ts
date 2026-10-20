/**
 * Port for the WhatsApp gateway configuration.
 *
 * The session the coach sends through, because it changes by itself: every WhatsApp re-pairing
 * (session dropped, QR rescanned) gives a new one. It lives in the database so the admin can fix
 * it in a form, instead of in the environment where it would need a redeploy to restore the
 * coach's voice. Next to it, Inigo's own number: the same account, seen from the athlete's side.
 */
export interface WhatsappGatewayRepository {
  /** The recorded session, or null when none has been set yet. */
  getSessionId(): Promise<string | null>;
  /** Record the session. Idempotent, overwrites whatever was there. */
  setSessionId(sessionId: string): Promise<void>;
  /** Inigo's WhatsApp number (E.164), or null when none has been set yet. */
  getWhatsappNumber(): Promise<string | null>;
  /**
   * Record Inigo's WhatsApp number, null clears it. `false` when no session is recorded yet:
   * the number belongs to the gateway, which only exists once its session is set.
   */
  setWhatsappNumber(whatsappNumber: string | null): Promise<boolean>;
}
