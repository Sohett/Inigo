import { getDeps } from "../../../../src/deps";
import { verifyWebhookSignature, OPENWA_SIGNATURE_HEADER } from "../../../../src/auth";
import { createRouteInboundMessage } from "../../../../src/use-cases/routeInboundMessage";
import { createHandleGatewaySessionEvent } from "../../../../src/use-cases/handleGatewaySessionEvent";
import { isGatewaySessionEvent } from "../../../../src/mappers/whatsappPayload";

// Webhook deliveries are dynamic and must never be cached.
export const dynamic = "force-dynamic";
// Appending one event to a session is a single fast POST; keep a small ceiling.
export const maxDuration = 30;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const deps = getDeps();

  // Optional HMAC: verify only when a secret is configured.
  if (deps.config.WHATSAPP_WEBHOOK_SECRET) {
    const signature = request.headers.get(OPENWA_SIGNATURE_HEADER);
    if (!verifyWebhookSignature(rawBody, signature, deps.config.WHATSAPP_WEBHOOK_SECRET)) {
      return json({ ok: false, error: "invalid_signature" }, 401);
    }
  }

  let payload: unknown;
  try {
    payload = rawBody.length > 0 ? JSON.parse(rawBody) : null;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // Session lifecycle events (INI-40) raise an alert and never fail: the alerter swallows its
  // own errors, so a Slack outage cannot make BullMQ replay the event into a second alert.
  if (isGatewaySessionEvent(payload)) {
    const outcome = await createHandleGatewaySessionEvent({ alerter: deps.alerter }).execute(payload);
    console.info(`[coach] session event: ${JSON.stringify(outcome)}`);
    return json({ ok: true }, 200);
  }

  try {
    const routeInboundMessage = createRouteInboundMessage({ repo: deps.repo, brain: deps.brain });
    const outcome = await routeInboundMessage.execute(payload);
    if (outcome.status === "forwarded") {
      console.info(
        `[coach] forwarded athlete=${outcome.athleteId} session=${outcome.sessionId} chat=${outcome.chatId}`
      );
    } else {
      console.info(`[coach] ignored delivery: ${outcome.reason}`);
    }
  } catch (error) {
    console.error("[coach] failed to forward inbound message", error);
    return json({ ok: false, error: "forward_failed" }, 502);
  }

  return json({ ok: true }, 200);
}
