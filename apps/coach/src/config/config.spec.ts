import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const base: Record<string, string> = {
  ANTHROPIC_API_KEY: "sk-ant-xxx",
  ANTHROPIC_SESSION_ID: "sesn_123"
};

describe("loadConfig", () => {
  it("parses a valid minimal env (secret optional)", () => {
    const config = loadConfig(base);
    expect(config.ANTHROPIC_SESSION_ID).toBe("sesn_123");
    expect(config.WHATSAPP_WEBHOOK_SECRET).toBeUndefined();
  });

  it("accepts an optional webhook secret", () => {
    const config = loadConfig({ ...base, WHATSAPP_WEBHOOK_SECRET: "a-very-long-webhook-secret" });
    expect(config.WHATSAPP_WEBHOOK_SECRET).toBe("a-very-long-webhook-secret");
  });

  it("throws when ANTHROPIC_API_KEY is missing", () => {
    const { ANTHROPIC_API_KEY, ...rest } = base;
    void ANTHROPIC_API_KEY;
    expect(() => loadConfig(rest)).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws when ANTHROPIC_SESSION_ID is missing", () => {
    const { ANTHROPIC_SESSION_ID, ...rest } = base;
    void ANTHROPIC_SESSION_ID;
    expect(() => loadConfig(rest)).toThrow(/ANTHROPIC_SESSION_ID/);
  });

  it("throws when the webhook secret is too short", () => {
    expect(() => loadConfig({ ...base, WHATSAPP_WEBHOOK_SECRET: "short" })).toThrow(
      /WHATSAPP_WEBHOOK_SECRET/
    );
  });
});
