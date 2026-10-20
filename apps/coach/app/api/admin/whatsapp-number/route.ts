import { z } from "zod";
import { json, requireAdmin } from "../../../../src/admin/guard";
import { getDeps } from "../../../../src/deps";

// Admin actions are always dynamic and must never be cached.
export const dynamic = "force-dynamic";

/** Inigo's WhatsApp number in E.164, spaces tolerated as typed (`+32 470 12 34 56`). */
const whatsappNumber = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\+\d{8,15}$/, "must be an E.164 number, e.g. +32470123456"));

/** An empty field clears the number: the web pages then simply have no way back to WhatsApp. */
const bodySchema = z.object({
  whatsappNumber: z.union([z.literal("").transform(() => null), whatsappNumber, z.null()])
});

/**
 * Record Inigo's WhatsApp number on the gateway: where a web page sends the athlete back to the
 * conversation (`wa.me`), e.g. after connecting Intervals.icu. The gateway row only exists once
 * its session is set, hence the 409 before that.
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
  if (!parsed.success) return json({ ok: false, error: "invalid_whatsapp_number" }, 400);

  try {
    const recorded = await getDeps().whatsappGateway.setWhatsappNumber(parsed.data.whatsappNumber);
    if (!recorded) return json({ ok: false, error: "whatsapp_session_missing" }, 409);
    console.info("[coach] whatsapp number updated");
    return json({ ok: true }, 200);
  } catch (error) {
    console.error("[coach] failed to record the whatsapp number", error);
    return json({ ok: false, error: "whatsapp_number_update_failed" }, 502);
  }
}
