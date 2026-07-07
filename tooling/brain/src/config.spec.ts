import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("accepts a minimal valid environment", () => {
    const config = loadConfig({ ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(config.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(config.BRAIN_AGENT_ID).toBeUndefined();
  });

  it("keeps the optional agent id when present", () => {
    const config = loadConfig({ ANTHROPIC_API_KEY: "sk-ant-test", BRAIN_AGENT_ID: "agent_123" });
    expect(config.BRAIN_AGENT_ID).toBe("agent_123");
  });

  it("throws a readable error naming the missing key", () => {
    expect(() => loadConfig({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("uses the custom message for an empty API key", () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: "" })).toThrow(/ANTHROPIC_API_KEY is required/);
  });
});
