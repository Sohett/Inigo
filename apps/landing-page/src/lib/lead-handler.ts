import type { APIContext } from "astro";
import { leadSchema } from "@/lib/lead-schema";
import { normalizePhone } from "@/lib/phone";
import { notifyNewLead } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientKey(context: APIContext): string {
  const forwarded = context.request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) {
    return first;
  }
  try {
    return context.clientAddress;
  } catch {
    return "unknown";
  }
}

/**
 * Logique du endpoint POST /api/lead (cf. spec §8). Vit dans `lib/` pour rester testable :
 * un `.spec.ts` sous `src/pages/` serait traité par Astro comme une route.
 */
export async function handleLead(context: APIContext): Promise<Response> {
  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ ok: false, error: "payload" }, 400);
  }

  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: "payload" }, 400);
  }
  const data = parsed.data;

  // Honeypot rempli → on répond OK sans rien transmettre.
  if (data._hp && data._hp.trim().length > 0) {
    return json({ ok: true }, 200);
  }

  // Rate-limit best-effort par IP.
  if (!rateLimit(clientKey(context), Date.now())) {
    return json({ ok: false, error: "rate_limit" }, 429);
  }

  // Normalisation E.164 ; rejet si invalide.
  const phone = normalizePhone(data.phone);
  if (!phone) {
    return json({ ok: false, error: "phone" }, 400);
  }

  // Transmission au webhook.
  try {
    await notifyNewLead({
      firstName: data.firstName && data.firstName.length > 0 ? data.firstName : undefined,
      phone,
      consent: true,
      source: "landing-page",
      createdAt: new Date().toISOString(),
    });
  } catch {
    return json({ ok: false, error: "server" }, 500);
  }

  return json({ ok: true }, 200);
}
