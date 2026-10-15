import { and, eq } from "drizzle-orm";
import type { Db } from "./client";
import { openSecret, sealSecret } from "./crypto";
import { athleteCredential } from "./schema";
import type { CredentialAuthType, CredentialProvider } from "./schema";

/**
 * Dedicated read/write path for per-athlete secrets, so the encrypt/decrypt boundary
 * lives in one place and plaintext never leaks into general queries or logs.
 */

const DEFAULT_PROVIDER: CredentialProvider = "intervals_icu";

/** An athlete's decrypted Intervals.icu credential, as needed to call their API. */
export interface IntervalsCredential {
  /** What `secret` is: an API key (HTTP Basic password) or an OAuth access token (Bearer). */
  authType: CredentialAuthType;
  /** The decrypted secret. */
  secret: string;
  /** Intervals.icu athlete id (e.g. "i123456"), null if it was never recorded. */
  externalAthleteId: string | null;
}

/**
 * Fetch and decrypt an athlete's Intervals.icu credential, or null if none is stored.
 * Returns the secret, how it authenticates, and the external athlete id — a caller needs all
 * three to build a client (the id keys every `/athlete/{id}/…` path).
 */
export async function getIntervalsCredential(
  db: Db,
  athleteId: string,
  masterKeyBase64: string
): Promise<IntervalsCredential | null> {
  const rows = await db
    .select({
      authType: athleteCredential.authType,
      externalAthleteId: athleteCredential.externalAthleteId,
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
  const secret = openSecret(
    { ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag },
    masterKeyBase64
  );
  return { authType: row.authType, secret, externalAthleteId: row.externalAthleteId };
}

/**
 * Encrypt and upsert an athlete's Intervals.icu credential. One per athlete: connecting by OAuth
 * replaces an API key, and the other way round.
 */
export async function setIntervalsCredential(
  db: Db,
  params: { athleteId: string; authType: CredentialAuthType; secret: string; externalAthleteId?: string },
  masterKeyBase64: string
): Promise<void> {
  const sealed = sealSecret(params.secret, masterKeyBase64);
  await db
    .insert(athleteCredential)
    .values({
      athleteId: params.athleteId,
      provider: DEFAULT_PROVIDER,
      authType: params.authType,
      externalAthleteId: params.externalAthleteId,
      secretCiphertext: sealed.ciphertext,
      secretIv: sealed.iv,
      secretAuthTag: sealed.authTag
    })
    .onConflictDoUpdate({
      target: [athleteCredential.athleteId, athleteCredential.provider],
      set: {
        authType: params.authType,
        externalAthleteId: params.externalAthleteId,
        secretCiphertext: sealed.ciphertext,
        secretIv: sealed.iv,
        secretAuthTag: sealed.authTag,
        rotatedAt: new Date(),
        updatedAt: new Date()
      }
    });
}

/**
 * The Intervals.icu athlete id an athlete is connected to, or null when none is stored. Reads no
 * secret: enough to refuse silently swapping the account behind an athlete (INI-69).
 */
export async function getIntervalsAccountId(db: Db, athleteId: string): Promise<string | null> {
  const rows = await db
    .select({ externalAthleteId: athleteCredential.externalAthleteId })
    .from(athleteCredential)
    .where(and(eq(athleteCredential.athleteId, athleteId), eq(athleteCredential.provider, DEFAULT_PROVIDER)))
    .limit(1);
  return rows[0]?.externalAthleteId ?? null;
}
