import { getDeps } from "../../../../src/deps";
import { verifyWebhookSignature, OPENWA_SIGNATURE_HEADER } from "../../../../src/auth";
import { whatsappToAnthropicManagedAgentsMapper } from "../../../../src/mappers/whatsappToAnthropicManagedAgentsMapper";

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

  try {
    const result = await whatsappToAnthropicManagedAgentsMapper(
      { brain: deps.brain, sessionId: deps.config.ANTHROPIC_SESSION_ID },
      payload
    );
    if (result.status === "forwarded") {
      console.info(`[coach] forwarded chat=${result.chatId}`);
    } else {
      console.info(`[coach] ignored delivery: ${result.reason}`);
    }
  } catch (error) {
    console.error("[coach] failed to forward inbound message", error);
    return json({ ok: false, error: "forward_failed" }, 502);
  }

  return json({ ok: true }, 200);
}
