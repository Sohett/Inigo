import { getDeps } from "../../../../src/deps";
import { verifyBearerToken } from "../../../../src/auth";
import { createCheckGatewaySession } from "../../../../src/use-cases/checkGatewaySession";

// A health check must hit the gateway every time, never a cached answer.
export const dynamic = "force-dynamic";
// One Neon read + a gateway GET (15s) + at most one restart (25s) + one Slack POST (5s).
export const maxDuration = 60;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/**
 * The WhatsApp session watchdog, called by the Vercel cron declared in `vercel.json`.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on every cron call. The secret is read here,
 * not in `configSchema`, so a missing one disables the watchdog alone; and it fails closed, so
 * nobody else can use this public URL to hammer the gateway or flood Slack during an outage.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    console.error("[coach] watchdog: CRON_SECRET is not set, refusing to run");
    return json({ ok: false, error: "cron_not_configured" }, 503);
  }
  const header = request.headers.get("authorization") ?? "";
  if (!verifyBearerToken(header, `Bearer ${secret}`)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const deps = getDeps();
    const outcome = await createCheckGatewaySession({
      gateway: deps.whatsappGateway,
      resolveClient: deps.whatsapp,
      alerter: deps.alerter
    }).execute();
    return json({ ok: true, ...outcome }, 200);
  } catch (error) {
    console.error("[coach] watchdog: failed to run the check", error);
    return json({ ok: false, error: "check_failed" }, 500);
  }
}
