import { createHmac } from "node:crypto";
import { describe, it, expect, afterEach } from "vitest";
import { adminCredentials, verifyBasicAuth, verifyBearerToken, verifyWebhookSignature } from "./auth";

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

describe("adminCredentials", () => {
  const set = (user?: string, password?: string) => {
    if (user === undefined) delete process.env["ADMIN_USER"];
    else process.env["ADMIN_USER"] = user;
    if (password === undefined) delete process.env["ADMIN_PASSWORD"];
    else process.env["ADMIN_PASSWORD"] = password;
  };

  afterEach(() => set(undefined, undefined));

  it("returns the pair when both are usable", () => {
    set("inigo", "a-very-long-admin-password");
    expect(adminCredentials()).toEqual({ user: "inigo", password: "a-very-long-admin-password" });
  });

  // Fails closed rather than throwing: a bad admin credential disables the admin, it never
  // reaches the WhatsApp webhook or the MCP endpoints.
  it("returns null when either is missing", () => {
    set(undefined, "a-very-long-admin-password");
    expect(adminCredentials()).toBeNull();
    set("inigo", undefined);
    expect(adminCredentials()).toBeNull();
    set(undefined, undefined);
    expect(adminCredentials()).toBeNull();
  });

  it("returns null when the password is too short to be a credential", () => {
    set("inigo", "short");
    expect(adminCredentials()).toBeNull();
  });

  it("returns null when the user is too short", () => {
    set("ab", "a-very-long-admin-password");
    expect(adminCredentials()).toBeNull();
  });

  it("treats empty strings as unset", () => {
    set("", "");
    expect(adminCredentials()).toBeNull();
  });
});
