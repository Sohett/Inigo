import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const validEnv = {
  INTERVALS_API_KEY: "test-api-key",
  INTERVALS_ATHLETE_ID: "i123456",
  MCP_BEARER_TOKEN: "a-very-long-secret-token-value",
} satisfies NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("parses a valid environment and applies defaults", () => {
    const config = loadConfig(validEnv);
    expect(config.INTERVALS_API_KEY).toBe("test-api-key");
    expect(config.ENABLE_WRITE_TOOLS).toBe(false);
    expect(config.INTERVALS_BASE_URL).toBe("https://intervals.icu/api/v1");
  });

  it("coerces ENABLE_WRITE_TOOLS truthy strings to boolean", () => {
    expect(loadConfig({ ...validEnv, ENABLE_WRITE_TOOLS: "true" }).ENABLE_WRITE_TOOLS).toBe(true);
    expect(loadConfig({ ...validEnv, ENABLE_WRITE_TOOLS: "1" }).ENABLE_WRITE_TOOLS).toBe(true);
    expect(loadConfig({ ...validEnv, ENABLE_WRITE_TOOLS: "0" }).ENABLE_WRITE_TOOLS).toBe(false);
  });

  it("throws when a required variable is missing", () => {
    const { INTERVALS_API_KEY: _omitted, ...rest } = validEnv;
    expect(() => loadConfig(rest)).toThrowError(/INTERVALS_API_KEY/);
  });

  it("throws when the bearer token is too short", () => {
    expect(() => loadConfig({ ...validEnv, MCP_BEARER_TOKEN: "short" })).toThrowError(
      /MCP_BEARER_TOKEN/
    );
  });

  it("rejects an invalid base URL", () => {
    expect(() => loadConfig({ ...validEnv, INTERVALS_BASE_URL: "not-a-url" })).toThrowError(
      /INTERVALS_BASE_URL/
    );
  });
});
