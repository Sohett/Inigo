import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyWebhookSignature } from "./auth";

const SECRET = "a-very-long-webhook-secret-value";

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts a correct signature over the raw body", () => {
    const body = '{"event":"message.received"}';
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = '{"event":"message.received"}';
    expect(verifyWebhookSignature(`${body} `, sign(body), SECRET)).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = "{}";
    expect(verifyWebhookSignature(body, sign(body, "another-long-secret-xx"), SECRET)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyWebhookSignature("{}", null, SECRET)).toBe(false);
    expect(verifyWebhookSignature("{}", undefined, SECRET)).toBe(false);
  });

  it("rejects a length-mismatched signature without throwing", () => {
    expect(verifyWebhookSignature("{}", "sha256=short", SECRET)).toBe(false);
  });
});
