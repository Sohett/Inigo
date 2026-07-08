import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const base: Record<string, string> = {
  ANTHROPIC_API_KEY: "sk-ant-xxx",
  DATABASE_URL: "postgresql://user:pass@host/db?sslmode=require",
  DB_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64")
};

describe("loadConfig", () => {
  it("parses a valid minimal env (secret optional)", () => {
    const config = loadConfig(base);
    expect(config.ANTHROPIC_API_KEY).toBe("sk-ant-xxx");
    expect(config.WHATSAPP_WEBHOOK_SECRET).toBeUndefined();
    expect(config.DATABASE_URL).toContain("postgresql://");
  });

  it("throws when DATABASE_URL is missing", () => {
    const { DATABASE_URL, ...rest } = base;
    void DATABASE_URL;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when DB_ENCRYPTION_KEY is not a 32-byte base64 key", () => {
    expect(() => loadConfig({ ...base, DB_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(
      /DB_ENCRYPTION_KEY/
    );
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

  it("throws when the webhook secret is too short", () => {
    expect(() => loadConfig({ ...base, WHATSAPP_WEBHOOK_SECRET: "short" })).toThrow(
      /WHATSAPP_WEBHOOK_SECRET/
    );
  });
});
