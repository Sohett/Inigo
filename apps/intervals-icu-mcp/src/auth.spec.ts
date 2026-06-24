import { describe, it, expect } from "vitest";
import { verifyBearerToken } from "./auth";

describe("verifyBearerToken", () => {
  const secret = "a-very-long-secret-token-value";

  it("accepts the exact token", () => {
    expect(verifyBearerToken(secret, secret)).toBe(true);
  });

  it("rejects a wrong token of equal length", () => {
    const wrong = "a-very-long-secret-token-WRONG";
    expect(wrong.length).toBe(secret.length);
    expect(verifyBearerToken(wrong, secret)).toBe(false);
  });

  it("rejects a token of different length", () => {
    expect(verifyBearerToken("short", secret)).toBe(false);
  });
});
