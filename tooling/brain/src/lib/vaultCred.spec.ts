import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createBrainClient } from "../client";
import { addEnvVarCredential } from "./vaultCred";

const API = "https://api.anthropic.com/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => createBrainClient("sk-ant-test", { maxRetries: 0 });
const SECRET = "super-secret-token-value";

const input = {
  vaultId: "vlt_1",
  secretName: "INTERVALS_API_KEY",
  secretValue: SECRET,
  allowedHosts: ["api.intervals.icu"],
  displayName: "Intervals key"
};

describe("addEnvVarCredential", () => {
  it("masks the secret and does not write in dry-run mode", async () => {
    // No POST handler registered → onUnhandledRequest:error would fire if it wrote.
    const result = await addEnvVarCredential(client(), input, false);
    expect(result.applied).toBe(false);
    expect(result.plan.secretValue).toBe("***");
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("creates the credential when applied and never leaks the secret in the result", async () => {
    server.use(
      http.post(`${API}/vaults/vlt_1/credentials`, () => HttpResponse.json({ id: "vcrd_1" }))
    );
    const result = await addEnvVarCredential(client(), input, true);
    expect(result.applied).toBe(true);
    expect(result.credentialId).toBe("vcrd_1");
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("rejects an empty allowedHosts list", async () => {
    await expect(
      addEnvVarCredential(client(), { ...input, allowedHosts: [] }, true)
    ).rejects.toThrow(/allowedHosts/);
  });
});
