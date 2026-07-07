import { describe, expect, it } from "vitest";
import { generateMasterKey, openSecret, sealSecret } from "./crypto";

describe("secret sealing (AES-256-GCM)", () => {
  const key = generateMasterKey();

  it("round-trips a secret back to the original plaintext", () => {
    const plaintext = "intervals-icu-api-key-abc123";
    const sealed = sealSecret(plaintext, key);
    expect(openSecret(sealed, key)).toBe(plaintext);
  });

  it("never stores the plaintext in the ciphertext", () => {
    const plaintext = "super-secret-token";
    const sealed = sealSecret(plaintext, key);
    expect(sealed.ciphertext.toString("utf8")).not.toContain(plaintext);
    expect(sealed.ciphertext.toString("base64")).not.toContain(
      Buffer.from(plaintext).toString("base64")
    );
  });

  it("produces a fresh IV each call (no deterministic ciphertext)", () => {
    const a = sealSecret("same", key);
    const b = sealSecret("same", key);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("fails to decrypt with the wrong key", () => {
    const sealed = sealSecret("secret", key);
    expect(() => openSecret(sealed, generateMasterKey())).toThrow();
  });

  it("fails to decrypt when the ciphertext is tampered", () => {
    const sealed = sealSecret("secret", key);
    sealed.ciphertext[0] = (sealed.ciphertext[0] ?? 0) ^ 0xff;
    expect(() => openSecret(sealed, key)).toThrow();
  });

  it("rejects a master key that is not 32 bytes", () => {
    const shortKey = Buffer.alloc(16).toString("base64");
    expect(() => sealSecret("secret", shortKey)).toThrow(/32 bytes/);
  });
});
