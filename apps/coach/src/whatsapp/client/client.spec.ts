import { describe, it, expect, vi } from "vitest";
import { OpenWaClient } from "./client";
import { OpenWaApiError } from "./errors";

const OPTIONS = {
  baseUrl: "https://gateway.example/",
  apiKey: "owa_k1_secret",
  sessionId: "11111111-2222-4333-8444-555555555555"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** What the gateway answers when the send went through. */
const OK_BODY = {
  jsonrpc: "2.0",
  id: 1,
  result: { content: [{ type: "text", text: JSON.stringify({ success: true, id: "msg_1" }) }] }
};

describe("OpenWaClient.sendText", () => {
  it("calls the gateway's MCP endpoint with the session id and the bearer", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(OK_BODY));
    const client = new OpenWaClient({ ...OPTIONS, fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.sendText("32475123456@c.us", "salut");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    // The trailing slash of baseUrl must not produce a double slash.
    expect(url).toBe("https://gateway.example/mcp");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer owa_k1_secret");
    expect(JSON.parse(init.body as string)).toMatchObject({
      method: "tools/call",
      params: {
        name: "MessageSendText",
        arguments: { sessionId: OPTIONS.sessionId, chatId: "32475123456@c.us", text: "salut" }
      }
    });
  });

  it("reads a response delivered as an SSE frame", async () => {
    const sse = `event: message\ndata: ${JSON.stringify(OK_BODY)}\n\n`;
    const fetchImpl = vi.fn(
      async () => new Response(sse, { headers: { "content-type": "text/event-stream" } })
    );
    const client = new OpenWaClient({ ...OPTIONS, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.sendText("32475123456@c.us", "salut")).resolves.toBeUndefined();
  });

  // The regression that made the coach go mute: HTTP 200, but nothing was delivered.
  it("throws when the gateway answers 200 with success:false", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, message: "Session 'x' is not active." })
          }
        ]
      }
    };
    const fetchImpl = vi.fn(async () => jsonResponse(body));
    const client = new OpenWaClient({ ...OPTIONS, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.sendText("chat", "salut")).rejects.toThrow(/is not active/);
  });

  it("throws on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ nope: true }, 502));
    const client = new OpenWaClient({ ...OPTIONS, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.sendText("chat", "salut")).rejects.toBeInstanceOf(OpenWaApiError);
  });

  // A send is not idempotent: retrying after a timeout duplicates the message for the athlete.
  it("never retries a failed send", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const client = new OpenWaClient({ ...OPTIONS, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.sendText("chat", "salut")).rejects.toThrow(/unreachable/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never puts the api key in the error it raises", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ nope: true }, 500));
    const client = new OpenWaClient({ ...OPTIONS, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.sendText("chat", "salut")).rejects.toSatisfy(
      (error: Error) => !error.message.includes(OPTIONS.apiKey)
    );
  });
});
