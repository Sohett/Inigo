import { describe, it, expect } from "vitest";
import { openWaCredentials } from "./credentials";
import { createOpenWaResolver } from "./resolveClient";

const COMPLETE = {
  OPENWA_BASE_URL: "https://gateway.example",
  OPENWA_API_KEY: "owa_k1_secret"
} as unknown as NodeJS.ProcessEnv;

describe("openWaCredentials", () => {
  it("reads the two variables", () => {
    expect(openWaCredentials(COMPLETE)).toEqual({
      baseUrl: "https://gateway.example",
      apiKey: "owa_k1_secret"
    });
  });

  // The gateway session is deliberately absent: it lives in Neon, not in the environment,
  // because every WhatsApp re-pairing changes it and a redeploy is no way to fix a mute coach.
  it("does not read a session id from the environment", () => {
    const env = { ...COMPLETE, OPENWA_SESSION_ID: "from-env" } as unknown as NodeJS.ProcessEnv;
    expect(openWaCredentials(env)).not.toHaveProperty("sessionId");
  });

  it.each(["OPENWA_BASE_URL", "OPENWA_API_KEY"])(
    "fails closed when %s is missing",
    (missing) => {
      const env = { ...COMPLETE, [missing]: undefined } as unknown as NodeJS.ProcessEnv;
      expect(openWaCredentials(env)).toBeNull();
    }
  );
});

describe("createOpenWaResolver", () => {
  it("builds a client when the environment is complete", () => {
    expect(createOpenWaResolver(COMPLETE)()).toBeDefined();
  });

  // The whole point of a resolver: an incomplete environment must fail here, on the WhatsApp
  // tool, and not when `getDeps()` runs for the webhook or the two other MCP servers.
  it("throws a message that names the variables but no secret", () => {
    const resolve = createOpenWaResolver({} as NodeJS.ProcessEnv);
    expect(resolve).toThrow(/OPENWA_BASE_URL and OPENWA_API_KEY/);
  });

  it("does not throw at build time, only when called", () => {
    expect(() => createOpenWaResolver({} as NodeJS.ProcessEnv)).not.toThrow();
  });
});
