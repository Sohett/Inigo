import { describe, it, expect, vi } from "vitest";
import { OpenWaClient } from "./client";
import { OpenWaApiError } from "./errors";

const OPTIONS = { baseUrl: "https://gateway.example/", apiKey: "owa_k1_secret" };
const SESSION = "11111111-2222-4333-8444-555555555555";
const CHAT = "32475123456@c.us";

function client(fetchImpl: ReturnType<typeof vi.fn>): OpenWaClient {
  return new OpenWaClient({ ...OPTIONS, fetchImpl: fetchImpl as unknown as typeof fetch });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("OpenWaClient.sendText", () => {
  it("posts to the gateway's send-text route with the api key header", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, id: "msg_1" }));
    await client(fetchImpl).sendText(SESSION, CHAT, "salut");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    // The trailing slash of baseUrl must not produce a double slash.
    expect(url).toBe(`https://gateway.example/api/sessions/${SESSION}/messages/send-text`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("owa_k1_secret");
    expect(JSON.parse(init.body as string)).toEqual({ chatId: CHAT, text: "salut" });
  });

  it("escapes the session in the path", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true }));
    await client(fetchImpl).sendText("my session", CHAT, "salut");

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toContain("/api/sessions/my%20session/messages/");
  });

  it("accepts a 2xx with no body at all", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(client(fetchImpl).sendText(SESSION, CHAT, "salut")).resolves.toBeUndefined();
  });

  // The failure that made the coach go mute: the gateway answers 200 and sends nothing.
  it("throws when a 2xx body reports success:false", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: false, message: "Session is not active." })
    );
    await expect(client(fetchImpl).sendText(SESSION, CHAT, "salut")).rejects.toThrow(
      /did not send the message: Session is not active/
    );
  });

  it("throws on a non-2xx, surfacing the gateway's reason", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "unknown session" }, 404));
    const error = await client(fetchImpl)
      .sendText(SESSION, CHAT, "salut")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenWaApiError);
    expect((error as OpenWaApiError).status).toBe(404);
    expect((error as Error).message).toContain("unknown session");
  });

  it("falls back to the status when a failing gateway explains nothing", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(client(fetchImpl).sendText(SESSION, CHAT, "salut")).rejects.toThrow(/HTTP 500/);
  });

  // A send is not idempotent: retrying after a timeout duplicates the message for the athlete.
  it("never retries, and tells the agent not to either", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("The operation was aborted due to timeout.");
    });
    await expect(client(fetchImpl).sendText(SESSION, CHAT, "salut")).rejects.toThrow(
      /MAY already have been delivered: do not send it again/
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // Both identifiers reach the model as tool results, so neither may appear in an error.
  it.each([
    ["the session id", `Session '${SESSION}' is not active.`, SESSION],
    ["the api key", `bad key ${OPTIONS.apiKey}`, OPTIONS.apiKey]
  ])("keeps %s out of the error it raises", async (_label, gatewayMessage, secret) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false, message: gatewayMessage }));
    const error = await client(fetchImpl)
      .sendText(SESSION, CHAT, "salut")
      .catch((caught: unknown) => caught);

    expect((error as Error).message).not.toContain(secret);
  });
});

describe("OpenWaClient.getSession", () => {
  it("reads the session with the api key header", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: SESSION, name: "inigo", status: "ready", lastError: null, engineLoaded: true })
    );
    await expect(client(fetchImpl).getSession(SESSION)).resolves.toEqual({
      id: SESSION,
      status: "ready",
      lastError: null
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://gateway.example/api/sessions/${SESSION}`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("owa_k1_secret");
  });

  it("tolerates a lastError that is not a string", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: SESSION, status: "failed", lastError: { code: "TOS_BLOCK" } })
    );
    await expect(client(fetchImpl).getSession(SESSION)).resolves.toMatchObject({
      status: "failed",
      lastError: '{"code":"TOS_BLOCK"}'
    });
  });

  it("resolves null when the gateway does not know the session", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "Session not found" }, 404));
    await expect(client(fetchImpl).getSession(SESSION)).resolves.toBeNull();
  });

  it("throws on another non-2xx, without leaking the session id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: `boom on ${SESSION}` }, 500));
    const error = await client(fetchImpl)
      .getSession(SESSION)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenWaApiError);
    expect((error as OpenWaApiError).status).toBe(500);
    expect((error as Error).message).not.toContain(SESSION);
  });

  it("throws with a null status when the gateway does not answer", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const error = await client(fetchImpl)
      .getSession(SESSION)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenWaApiError);
    expect((error as OpenWaApiError).status).toBeNull();
  });

  it("throws when a 2xx body is not a session", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true }));
    await expect(client(fetchImpl).getSession(SESSION)).rejects.toThrow(/unreadable session/);
  });
});
