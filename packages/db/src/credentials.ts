import { and, eq } from "drizzle-orm";
import type { Db } from "./client";
import { openSecret, sealSecret } from "./crypto";
import { athleteCredential } from "./schema";
import type { CredentialProvider } from "./schema";

/**
 * Dedicated read/write path for per-athlete secrets, so the encrypt/decrypt boundary
 * lives in one place and plaintext never leaks into general queries or logs.
 */

const DEFAULT_PROVIDER: CredentialProvider = "intervals_icu";

/** Fetch and decrypt an athlete's Intervals.icu API key, or null if none is stored. */
export async function getIntervalsKey(
  db: Db,
  athleteId: string,
  masterKeyBase64: string
): Promise<string | null> {
  const rows = await db
    .select({
      ciphertext: athleteCredential.secretCiphertext,
      iv: athleteCredential.secretIv,
      authTag: athleteCredential.secretAuthTag
    })
    .from(athleteCredential)
    .where(
      and(
        eq(athleteCredential.athleteId, athleteId),
        eq(athleteCredential.provider, DEFAULT_PROVIDER)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return openSecret({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag }, masterKeyBase64);
}

/** Encrypt and upsert an athlete's Intervals.icu API key. */
export async function setIntervalsKey(
  db: Db,
  params: { athleteId: string; apiKey: string; externalAthleteId?: string },
  masterKeyBase64: string
): Promise<void> {
  const sealed = sealSecret(params.apiKey, masterKeyBase64);
  await db
    .insert(athleteCredential)
    .values({
      athleteId: params.athleteId,
      provider: DEFAULT_PROVIDER,
      externalAthleteId: params.externalAthleteId,
      secretCiphertext: sealed.ciphertext,
      secretIv: sealed.iv,
      secretAuthTag: sealed.authTag
    })
    .onConflictDoUpdate({
      target: [athleteCredential.athleteId, athleteCredential.provider],
      set: {
        externalAthleteId: params.externalAthleteId,
        secretCiphertext: sealed.ciphertext,
        secretIv: sealed.iv,
        secretAuthTag: sealed.authTag,
        rotatedAt: new Date(),
        updatedAt: new Date()
      }
    });
}
