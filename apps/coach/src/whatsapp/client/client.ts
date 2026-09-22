import { z } from "zod";
import { OpenWaApiError } from "./errors";

export interface OpenWaClientOptions {
  /** Gateway base URL, e.g. https://whatsapp.inigo-coach.com (no trailing slash). */
  baseUrl: string;
  /** OpenWA API key with the OPERATOR role (`owa_k1_…`). Never logged, never returned. */
  apiKey: string;
  /**
   * The gateway session to send from. This is the session **UUID**, not its name:
   * `MessageSendText` rejects the name with "Session '<x>' is not active", which is exactly
   * how the coach went mute in production (INI-24).
   */
  sessionId: string;
  /** Per-request timeout in milliseconds. Default 15000. */
  timeoutMs?: number;
  /** Injectable fetch, primarily for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** The JSON-RPC envelope OpenWA's MCP endpoint answers with. */
const rpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).nullish(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
  result: z
    .object({
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      isError: z.boolean().optional()
    })
    .optional()
});

/** OpenWA wraps its own outcome in the tool result text. `success: false` carries the reason. */
const toolPayloadSchema = z.object({
  success: z.boolean().optional(),
  message: z.string().optional(),
  name: z.string().optional()
});

/**
 * Minimal client for the OpenWA gateway, used by the `/api/whatsapp/mcp` server.
 *
 * It speaks OpenWA's **MCP** endpoint (`POST /mcp`, JSON-RPC `tools/call`) rather than a REST
 * route: the gateway publishes no OpenAPI document and no send endpoint is documented, while
 * the `MessageSendText` contract is published by `tools/list` and verified in production. The
 * transport is an implementation detail behind this class, swappable the day OpenWA documents
 * a REST route.
 *
 * Deliberately **no retry**. A send is not idempotent: a second attempt after a timeout is a
 * duplicate message for the athlete, which is worse than a reported failure.
 */
export class OpenWaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly sessionId: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenWaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.sessionId = options.sessionId;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Send a plain text message to a WhatsApp chat. Resolves on success, throws otherwise. */
  async sendText(chatId: string, text: string): Promise<void> {
    await this.callTool("MessageSendText", { sessionId: this.sessionId, chatId, text });
  }

  private async callTool(tool: string, args: Record<string, unknown>): Promise<void> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args }
    });

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          // The MCP streamable transport may answer either way; accept both.
          accept: "application/json, text/event-stream"
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new OpenWaApiError(`WhatsApp gateway unreachable: ${reason}`, { tool });
    }

    const raw = await response.text();
    if (!response.ok) {
      throw new OpenWaApiError(`WhatsApp gateway returned HTTP ${response.status}.`, {
        tool,
        status: response.status
      });
    }

    const rpc = rpcResponseSchema.safeParse(parseRpcBody(raw));
    if (!rpc.success) {
      throw new OpenWaApiError("WhatsApp gateway answered an unreadable payload.", {
        tool,
        status: response.status
      });
    }
    if (rpc.data.error) {
      throw new OpenWaApiError(`WhatsApp gateway refused the call: ${rpc.data.error.message}`, {
        tool,
        status: response.status
      });
    }

    // OpenWA reports business failures inside the tool result rather than as a JSON-RPC error,
    // so a 200 with `success: false` still means nothing was delivered.
    const text = rpc.data.result?.content?.find((block) => block.type === "text")?.text ?? "";
    const payload = toolPayloadSchema.safeParse(safeJsonParse(text));
    if (rpc.data.result?.isError === true || payload.data?.success === false) {
      const reason = payload.data?.message ?? text ?? "no reason given";
      throw new OpenWaApiError(`WhatsApp gateway did not send the message: ${reason}`, {
        tool,
        status: response.status
      });
    }
  }
}

/**
 * Read the JSON-RPC body whether it came back as plain JSON or as a single SSE frame
 * (`event: message\ndata: {...}`), which the MCP streamable transport is free to choose.
 */
function parseRpcBody(raw: string): unknown {
  const direct = safeJsonParse(raw);
  if (direct !== undefined) return direct;
  for (const line of raw.split("\n")) {
    if (line.startsWith("data:")) {
      const parsed = safeJsonParse(line.slice("data:".length).trim());
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
