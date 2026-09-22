import { z } from "zod";
import { json, requireAdmin } from "../../../../src/admin/guard";
import { getDeps } from "../../../../src/deps";

// Admin actions are always dynamic and must never be cached.
export const dynamic = "force-dynamic";

// Free-form on purpose: the OpenWA REST route accepts the session name as well as its id, and
// pinning a shape here would only reject values the gateway happily takes.
const bodySchema = z.object({ sessionId: z.string().trim().min(1).max(200) });

/**
 * Record the WhatsApp gateway session the coach sends through.
 *
 * It changes on every re-pairing (session dropped, QR rescanned), which is why it lives in the
 * database with a form in front of it rather than in the environment: restoring the coach's
 * voice must not need a redeploy.
 */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return json({ ok: false, error: "invalid_session_id" }, 400);

  try {
    await getDeps().whatsappGateway.setSessionId(parsed.data.sessionId);
    console.info("[coach] whatsapp gateway session updated");
    return json({ ok: true, sessionId: parsed.data.sessionId }, 200);
  } catch (error) {
    console.error("[coach] failed to record the whatsapp gateway session", error);
    return json({ ok: false, error: "whatsapp_session_update_failed" }, 502);
  }
}
