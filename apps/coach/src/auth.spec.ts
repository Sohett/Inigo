import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyBasicAuth, verifyBearerToken, verifyWebhookSignature } from "./auth";

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

describe("verifyBearerToken", () => {
  const TOKEN = "a-very-long-mcp-bearer-token";

  it("accepts the exact token", () => {
    expect(verifyBearerToken(TOKEN, TOKEN)).toBe(true);
  });

  it("rejects a wrong token of equal length", () => {
    const wrong = "x".repeat(TOKEN.length);
    expect(verifyBearerToken(wrong, TOKEN)).toBe(false);
  });

  it("rejects a length-mismatched token without throwing", () => {
    expect(verifyBearerToken("short", TOKEN)).toBe(false);
  });
});

describe("verifyBasicAuth", () => {
  const USER = "inigo";
  const PASSWORD = "a-very-long-admin-password";

  const header = (user: string, password: string) =>
    `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

  it("accepts the exact credentials", () => {
    expect(verifyBasicAuth(header(USER, PASSWORD), USER, PASSWORD)).toBe(true);
  });

  it("is case-insensitive on the scheme", () => {
    const encoded = Buffer.from(`${USER}:${PASSWORD}`).toString("base64");
    expect(verifyBasicAuth(`basic ${encoded}`, USER, PASSWORD)).toBe(true);
  });

  it("keeps a colon inside the password", () => {
    const password = "pass:with:colons:xxxxx";
    expect(verifyBasicAuth(header(USER, password), USER, password)).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(verifyBasicAuth(header(USER, "a-very-long-wrong-password"), USER, PASSWORD)).toBe(false);
  });

  it("rejects a wrong user", () => {
    expect(verifyBasicAuth(header("intruder", PASSWORD), USER, PASSWORD)).toBe(false);
  });

  it("rejects a missing or non-Basic header", () => {
    expect(verifyBasicAuth(null, USER, PASSWORD)).toBe(false);
    expect(verifyBasicAuth(undefined, USER, PASSWORD)).toBe(false);
    expect(verifyBasicAuth("", USER, PASSWORD)).toBe(false);
    expect(verifyBasicAuth(`Bearer ${PASSWORD}`, USER, PASSWORD)).toBe(false);
    expect(verifyBasicAuth("Basic", USER, PASSWORD)).toBe(false);
  });

  it("rejects a payload with no colon without throwing", () => {
    const encoded = Buffer.from("nocolon").toString("base64");
    expect(verifyBasicAuth(`Basic ${encoded}`, USER, PASSWORD)).toBe(false);
  });

  it("rejects a length-mismatched password without throwing", () => {
    expect(verifyBasicAuth(header(USER, "short"), USER, PASSWORD)).toBe(false);
  });
});
