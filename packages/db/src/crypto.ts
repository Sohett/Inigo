import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * App-level envelope encryption for per-athlete secrets (the Intervals.icu API key).
 *
 * AES-256-GCM with a 32-byte master key supplied out of band (env `DB_ENCRYPTION_KEY`,
 * base64). The DB stores only ciphertext + IV + auth tag — never plaintext, never the
 * master key. GCM's auth tag makes tampering detectable on decrypt.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the GCM standard
const KEY_LENGTH = 32; // AES-256

export interface SealedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

function loadMasterKey(masterKeyBase64: string): Buffer {
  const key = Buffer.from(masterKeyBase64, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Invalid encryption key: expected ${KEY_LENGTH} bytes (base64), got ${key.length}`
    );
  }
  return key;
}

/** Encrypt a plaintext secret. Returns the material to persist as-is. */
export function sealSecret(plaintext: string, masterKeyBase64: string): SealedSecret {
  const key = loadMasterKey(masterKeyBase64);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

/** Decrypt a sealed secret. Throws if the key is wrong or the ciphertext was tampered. */
export function openSecret(sealed: SealedSecret, masterKeyBase64: string): string {
  const key = loadMasterKey(masterKeyBase64);
  const decipher = createDecipheriv(ALGORITHM, key, sealed.iv);
  decipher.setAuthTag(sealed.authTag);
  const plaintext = Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Generate a fresh base64 master key. Convenience for provisioning DB_ENCRYPTION_KEY. */
export function generateMasterKey(): string {
  return randomBytes(KEY_LENGTH).toString("base64");
}
