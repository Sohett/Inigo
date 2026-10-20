import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { whatsappGateway } from "./schema/whatsappGateway";

/**
 * Read the gateway session the coach sends through, or null when none has been recorded yet.
 * A null is a normal state (nothing configured), not an error: the caller turns it into a
 * message that says what to do.
 */
export async function getWhatsappSessionId(db: Db): Promise<string | null> {
  const rows = await db
    .select({ sessionId: whatsappGateway.sessionId })
    .from(whatsappGateway)
    .where(eq(whatsappGateway.id, true))
    .limit(1);
  return rows[0]?.sessionId ?? null;
}

/**
 * Record the gateway session. Upsert on the singleton row, so the admin form can be used as
 * often as the WhatsApp session is re-paired without ever creating a second row.
 */
export async function setWhatsappSessionId(db: Db, sessionId: string): Promise<void> {
  const trimmed = sessionId.trim();
  if (!trimmed) throw new Error("WhatsApp gateway session id cannot be empty.");
  await db
    .insert(whatsappGateway)
    .values({ id: true, sessionId: trimmed })
    .onConflictDoUpdate({
      target: whatsappGateway.id,
      set: { sessionId: trimmed, updatedAt: new Date() }
    });
}

/** Read Inigo's WhatsApp number, or null when none has been recorded yet. */
export async function getWhatsappNumber(db: Db): Promise<string | null> {
  const rows = await db
    .select({ whatsappNumber: whatsappGateway.whatsappNumber })
    .from(whatsappGateway)
    .where(eq(whatsappGateway.id, true))
    .limit(1);
  return rows[0]?.whatsappNumber ?? null;
}

/**
 * Record Inigo's WhatsApp number (null clears it) on the gateway row. The row only exists once a
 * session has been recorded (`session_id` is required), so this updates it rather than creating
 * it: `false` means there was no row, the session has to be set first.
 */
export async function setWhatsappNumber(db: Db, whatsappNumber: string | null): Promise<boolean> {
  const updated = await db
    .update(whatsappGateway)
    .set({ whatsappNumber, updatedAt: new Date() })
    .where(eq(whatsappGateway.id, true))
    .returning({ id: whatsappGateway.id });
  return updated.length > 0;
}
