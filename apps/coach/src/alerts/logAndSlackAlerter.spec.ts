import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import type { GatewayAlert } from "../domain/whatsappGateway";
import { createLogAndSlackAlerter, slackWebhookUrlFromEnv } from "./logAndSlackAlerter";

const SLACK_URL = "https://hooks.slack.com/services/T000/B000/secret-token";

const DOWN: GatewayAlert = {
  severity: "down",
  source: "webhook",
  code: "session_disconnected",
  message: "La session WhatsApp s'est déconnectée.",
  sessionId: "gateway-session"
};

let errorLog: MockInstance<typeof console.error>;
let infoLog: MockInstance<typeof console.info>;

beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createLogAndSlackAlerter", () => {
  it("logs a down alert as one structured error line", async () => {
    await createLogAndSlackAlerter().notify(DOWN);

    expect(errorLog).toHaveBeenCalledTimes(1);
    const line = String(errorLog.mock.calls[0]?.[0]);
    expect(line.startsWith("[coach][alert] ")).toBe(true);
    expect(JSON.parse(line.slice("[coach][alert] ".length))).toEqual({
      scope: "whatsapp_gateway",
      ...DOWN
    });
  });

  it("logs a recovery as info, not as an error", async () => {
    await createLogAndSlackAlerter().notify({ ...DOWN, severity: "recovered", code: "session_ready" });

    expect(infoLog).toHaveBeenCalledTimes(1);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("posts the alert to Slack when a webhook URL is configured", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    await createLogAndSlackAlerter({ slackWebhookUrl: SLACK_URL, fetchImpl }).notify(DOWN);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SLACK_URL);
    expect(init.method).toBe("POST");
    const { text } = JSON.parse(init.body as string) as { text: string };
    expect(text).toContain("La session WhatsApp s'est déconnectée.");
    expect(text).toContain("session_disconnected");
    expect(text).toContain("gateway-session");
  });

  it("does not call Slack without a webhook URL", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok"));
    await createLogAndSlackAlerter({ fetchImpl }).notify(DOWN);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // The contract the webhook relies on: a failed alert must never fail the delivery, or BullMQ
  // would replay the event and alert again, in a loop.
  it.each([
    ["answers an error", async () => new Response("no_service", { status: 404 })],
    [
      "does not answer",
      async () => {
        throw new TypeError("fetch failed");
      }
    ]
  ])("never throws when Slack %s, and never logs the URL", async (_label, impl) => {
    const fetchImpl = vi.fn(impl);
    await expect(
      createLogAndSlackAlerter({ slackWebhookUrl: SLACK_URL, fetchImpl }).notify(DOWN)
    ).resolves.toBeUndefined();

    const logged = errorLog.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("slack delivery failed");
    expect(logged).not.toContain("secret-token");
  });
});

describe("slackWebhookUrlFromEnv", () => {
  it("reads SLACK_ALERT_WEBHOOK_URL", () => {
    const env = { SLACK_ALERT_WEBHOOK_URL: SLACK_URL } as unknown as NodeJS.ProcessEnv;
    expect(slackWebhookUrlFromEnv(env)).toBe(SLACK_URL);
  });

  it("treats an empty value as absent", () => {
    const env = { SLACK_ALERT_WEBHOOK_URL: "" } as unknown as NodeJS.ProcessEnv;
    expect(slackWebhookUrlFromEnv(env)).toBeUndefined();
  });
});

describe("Slack header", () => {
  it.each([
    ["down", ":rotating_light: *WhatsApp: athletes' messages may not be reaching the coach*"],
    ["needs_human", ":sos: *WhatsApp: athletes' messages are not reaching the coach, action needed*"],
    ["recovered", ":white_check_mark: *WhatsApp: the session is back*"]
  ] as const)("%s → %s", async (severity, header) => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    await createLogAndSlackAlerter({ slackWebhookUrl: SLACK_URL, fetchImpl }).notify({ ...DOWN, severity });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const { text } = JSON.parse(init.body as string) as { text: string };
    expect(text.split("\n")[0]).toBe(header);
  });
});

