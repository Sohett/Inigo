import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./client";
import { getIntervalsKey, setIntervalsKey } from "./credentials";
import { athlete, athleteCredential } from "./schema";

/**
 * Live round-trip against a real Neon branch (the INI-9 acceptance criterion:
 * "coach reads/writes Neon via Drizzle"). Skipped unless DATABASE_URL and
 * DB_ENCRYPTION_KEY are set, so `pnpm verify` stays offline and green in CI.
 *
 * Run it with:
 *   DATABASE_URL=postgres://... DB_ENCRYPTION_KEY=<base64 32 bytes> \
 *     pnpm --filter @inigo/db test
 *
 * It provisions and tears down its own athlete row, so it is idempotent and does
 * not touch real data.
 */
const databaseUrl = process.env.DATABASE_URL;
const encryptionKey = process.env.DB_ENCRYPTION_KEY;
const TEST_PHONE = "+320000000000"; // reserved test number, never a real athlete

describe.skipIf(!databaseUrl || !encryptionKey)("coach <-> Neon round-trip (integration)", () => {
  let db: Db;
  let athleteId: string;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    // Defensive cleanup in case a previous run left the test row behind.
    await db.delete(athlete).where(eq(athlete.phoneNum, TEST_PHONE));
    const inserted = await db
      .insert(athlete)
      .values({ phoneNum: TEST_PHONE, displayName: "Integration Test" })
      .returning({ id: athlete.id });
    const row = inserted[0];
    expect(row).toBeDefined();
    athleteId = row!.id;
  });

  afterAll(async () => {
    if (db && athleteId) {
      // Cascade removes the credential row too.
      await db.delete(athlete).where(eq(athlete.id, athleteId));
    }
  });

  it("routes an athlete by phone_num", async () => {
    const rows = await db.select().from(athlete).where(eq(athlete.phoneNum, TEST_PHONE));
    expect(rows[0]?.id).toBe(athleteId);
  });

  it("seals and reads back the Intervals.icu key without storing plaintext", async () => {
    const apiKey = "test-intervals-key-xyz";
    await setIntervalsKey(db, { athleteId, apiKey, externalAthleteId: "i123456" }, encryptionKey as string);

    const recovered = await getIntervalsKey(db, athleteId, encryptionKey as string);
    expect(recovered).toBe(apiKey);

    const creds = await db
      .select({ ciphertext: athleteCredential.secretCiphertext })
      .from(athleteCredential)
      .where(eq(athleteCredential.athleteId, athleteId));
    const cred = creds[0];
    expect(cred).toBeDefined();
    expect(cred!.ciphertext.toString("utf8")).not.toContain(apiKey);
  });

  it("rotates the key in place (single row per athlete/provider)", async () => {
    await setIntervalsKey(db, { athleteId, apiKey: "rotated-key-2" }, encryptionKey as string);
    expect(await getIntervalsKey(db, athleteId, encryptionKey as string)).toBe("rotated-key-2");

    const creds = await db
      .select()
      .from(athleteCredential)
      .where(eq(athleteCredential.athleteId, athleteId));
    expect(creds).toHaveLength(1);
  });
});
