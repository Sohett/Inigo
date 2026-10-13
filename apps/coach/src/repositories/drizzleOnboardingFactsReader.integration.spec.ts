import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { athlete, athleteProfile, createDb, goal, setIntervalsKey, type Db } from "@inigo/db";
import { createDrizzleOnboardingFactsReader } from "./drizzleOnboardingFactsReader";

/**
 * Live round-trip of the onboarding facts query against a real Neon branch. Skipped unless
 * DATABASE_URL and DB_ENCRYPTION_KEY are set, so `pnpm verify` stays offline and green in CI.
 * Provisions and tears down its own athlete row (profile, goals, credential go by cascade).
 *
 * Run it with:
 *   DATABASE_URL=postgres://... DB_ENCRYPTION_KEY=... pnpm --filter @inigo/coach test
 */
const databaseUrl = process.env.DATABASE_URL;
const encryptionKey = process.env.DB_ENCRYPTION_KEY;
const TEST_PHONE = "+320000000006"; // reserved test number, never a real athlete

describe.skipIf(!databaseUrl || !encryptionKey)("drizzleOnboardingFactsReader (integration)", () => {
  let db: Db;
  let athleteId: string;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await db.delete(athlete).where(eq(athlete.phoneNum, TEST_PHONE));
    const inserted = await db
      .insert(athlete)
      .values({ phoneNum: TEST_PHONE, status: "onboarding" })
      .returning({ id: athlete.id });
    athleteId = inserted[0]!.id;
  });

  afterAll(async () => {
    if (db && athleteId) await db.delete(athlete).where(eq(athlete.id, athleteId));
  });

  it("reads a fresh athlete as nothing done", async () => {
    const facts = await createDrizzleOnboardingFactsReader(db).getOnboardingFacts(athleteId);
    expect(facts).toEqual({
      intervalsConnected: false,
      displayName: null,
      motivation: null,
      trainingBackground: null,
      activeGoalCount: 0,
      detailedGoalCount: 0,
      pastCoaching: null,
      coachExpectations: null,
      weeklyHours: null,
      ftpStatus: null,
      educationDone: false
    });
  });

  it("reads the profile, counts only active goals and sees the credential", async () => {
    await db.insert(athleteProfile).values({
      athleteId,
      motivation: "Reprendre",
      weeklyHours: "5",
      ftpStatus: "to_test",
      educationDone: true
    });
    await db.insert(goal).values([
      { athleteId, title: "Gran Fondo", status: "active", targetResult: "sub 6h", experience: "Jamais fait" },
      { athleteId, title: "Semi", status: "active", targetResult: "finir", experience: "  " },
      { athleteId, title: "Ancien objectif", status: "abandoned", targetResult: "x", experience: "y" }
    ]);
    await setIntervalsKey(
      db,
      { athleteId, apiKey: "test-key", externalAthleteId: "i000006" },
      encryptionKey as string
    );

    const facts = await createDrizzleOnboardingFactsReader(db).getOnboardingFacts(athleteId);
    expect(facts).toMatchObject({
      intervalsConnected: true,
      motivation: "Reprendre",
      activeGoalCount: 2,
      detailedGoalCount: 1,
      ftpStatus: "to_test",
      educationDone: true
    });
  });

  it("returns null for an unknown athlete", async () => {
    const reader = createDrizzleOnboardingFactsReader(db);
    expect(await reader.getOnboardingFacts("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
