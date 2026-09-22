import { z } from "zod";
import { OpenWaApiError } from "./errors";

export interface OpenWaClientOptions {
  /** Gateway base URL, e.g. https://whatsapp.inigo-coach.com (no trailing slash). */
  baseUrl: string;
  /** OpenWA API key with the OPERATOR role (`owa_k1_…`). Never logged, never returned. */
  apiKey: string;
  /** Per-request timeout in milliseconds. Default 15000. */
  timeoutMs?: number;
  /** Injectable fetch, primarily for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * What the gateway answers. The fields are all optional because the project documents the
 * request but not the response: we validate what we rely on and treat the HTTP status as the
 * primary signal, rather than guessing a schema.
 */
const sendResponseSchema = z.object({
  success: z.boolean().optional(),
  message: z.string().optional(),
  name: z.string().optional()
});

/**
 * Minimal client for the OpenWA gateway, used by the `/api/whatsapp/mcp` server.
 *
 * Deliberately **no retry**. A send is not idempotent: a second attempt after a timeout is a
 * duplicate message for the athlete, which is worse than a reported failure. The messages
 * raised here are read by the model, so a timeout says so explicitly.
 */
export class OpenWaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenWaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Send a plain text message to a WhatsApp chat.
   *
   * `sessionId` identifies the gateway session to send from; it lives in Neon, not in the
   * environment, because it changes every time the WhatsApp session drops or the QR is
   * rescanned. The REST route accepts the session name as well as its id.
   *
   * Resolves once the gateway has accepted the message, throws otherwise.
   */
  async sendText(sessionId: string, chatId: string, text: string): Promise<void> {
    const endpoint = `${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`;

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey },
        body: JSON.stringify({ chatId, text }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (cause) {
      // The one genuinely ambiguous case: the request may have reached the gateway. Neither we
      // nor the agent may retry, so the message says it rather than leaving it to be guessed.
      throw new OpenWaApiError(
        `WhatsApp gateway did not answer (${this.redact(errorText(cause), sessionId)}). The ` +
          `message MAY already have been delivered: do not send it again, report the problem ` +
          `instead.`,
        { status: null }
      );
    }

    const body = await readBody(response);

    if (!response.ok) {
      const parsed = sendResponseSchema.safeParse(body);
      const reason = parsed.data?.message || `HTTP ${response.status}`;
      throw new OpenWaApiError(
        `WhatsApp gateway did not send the message: ${this.redact(reason, sessionId)}`,
        { status: response.status }
      );
    }

    // A 2xx whose body still reports a failure is not a delivery. The gateway does this: the
    // production outage behind this server answered 200 with `success: false`.
    const parsed = sendResponseSchema.safeParse(body);
    if (parsed.data?.success === false) {
      const reason = parsed.data.message || "no reason given";
      throw new OpenWaApiError(
        `WhatsApp gateway did not send the message: ${this.redact(reason, sessionId)}`,
        { status: response.status }
      );
    }
  }

  /**
   * Strip the gateway's own identifiers out of anything it told us, before that text reaches an
   * error message. These messages travel to the model as tool results: an infrastructure
   * identifier has no business being there, and that coupling is what this server removes. The
   * key is never interpolated by us, but a talkative gateway echoing it back would be worse.
   */
  private redact(message: string, sessionId: string): string {
    return [sessionId, this.apiKey]
      .filter((secret) => secret.length > 0)
      .reduce((text, secret) => text.split(secret).join("<redacted>"), message);
  }
}

/** Read the response body as JSON when it is JSON, as text otherwise, and never throw. */
async function readBody(response: Response): Promise<unknown> {
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
