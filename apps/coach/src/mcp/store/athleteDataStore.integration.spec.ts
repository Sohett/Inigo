import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  athlete,
  athleteProfile,
  athleteThreshold,
  createDb,
  goal,
  type Db
} from "@inigo/db";
import { createAthleteDataStore } from "./athleteDataStore";

/**
 * Live round-trip of the store queries against a real Neon branch. Skipped unless
 * DATABASE_URL is set, so `pnpm verify` stays offline and green. Provisions and tears
 * down its own athlete row (cascades clean up children).
 *
 * Run it with:
 *   DATABASE_URL=postgres://... pnpm --filter @inigo/coach test
 */
const databaseUrl = process.env.DATABASE_URL;
const TEST_PHONE = "+320000000010"; // reserved test number, never a real athlete
const MISSING_ATHLETE = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!databaseUrl)("athleteDataStore (integration)", () => {
  let db: Db;
  let athleteId: string;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await db.delete(athlete).where(eq(athlete.phoneNum, TEST_PHONE));
    const inserted = await db
      .insert(athlete)
      .values({ phoneNum: TEST_PHONE, displayName: "Store Integration" })
      .returning({ id: athlete.id });
    athleteId = inserted[0]!.id;
    await db.insert(athleteProfile).values({ athleteId, healthNotes: "seed health" });
    await db
      .insert(athleteThreshold)
      .values({ athleteId, sport: "bike", ftpWatts: 282, effectiveDate: "2026-01-01" });
    await db.insert(goal).values({ athleteId, title: "Seed goal", status: "active" });
  });

  afterAll(async () => {
    if (db && athleteId) {
      await db.delete(athlete).where(eq(athlete.id, athleteId));
    }
  });

  it("reads the profile with safe fields only (no PII/secrets)", async () => {
    const store = createAthleteDataStore(db).forAthlete(athleteId);
    const profile = await store.getProfile();
    expect(profile).not.toBeNull();
    expect(profile!.displayName).toBe("Store Integration");
    expect(profile!.profile?.healthNotes).toBe("seed health");
    expect(profile).not.toHaveProperty("phoneNum");
    expect(JSON.stringify(profile)).not.toContain(TEST_PHONE);
  });

  it("returns null for an unknown athlete", async () => {
    const store = createAthleteDataStore(db).forAthlete(MISSING_ATHLETE);
    expect(await store.getProfile()).toBeNull();
  });

  it("reads the latest threshold per sport", async () => {
    const store = createAthleteDataStore(db).forAthlete(athleteId);
    const thresholds = await store.getThresholds();
    expect(thresholds.find((t) => t.sport === "bike")?.ftpWatts).toBe(282);
  });

  it("reads active goals", async () => {
    const store = createAthleteDataStore(db).forAthlete(athleteId);
    const goals = await store.getGoals();
    expect(goals.some((g) => g.title === "Seed goal")).toBe(true);
  });

  it("updates profile notes (upsert)", async () => {
    const store = createAthleteDataStore(db).forAthlete(athleteId);
    await store.updateProfile({ healthNotes: "updated health" });
    const profile = await store.getProfile();
    expect(profile!.profile?.healthNotes).toBe("updated health");
  });

  it("appends an adaptation-log entry and reads it back", async () => {
    const store = createAthleteDataStore(db).forAthlete(athleteId);
    await store.logAdaptation({ summary: "integration entry", author: "test" });
    const log = await store.getAdaptationLog();
    expect(log.some((e) => e.summary === "integration entry")).toBe(true);
  });

  it("creates then updates a goal", async () => {
    const store = createAthleteDataStore(db).forAthlete(athleteId);
    const created = await store.upsertGoal({ title: "Created goal", status: "active" });
    expect(created?.id).toBeDefined();
    const updated = await store.upsertGoal({ id: created!.id, status: "achieved" });
    expect(updated?.status).toBe("achieved");
  });

  it("does not update another athlete's goal (scoping)", async () => {
    const ours = createAthleteDataStore(db).forAthlete(athleteId);
    const goals = await ours.getGoals();
    const otherStore = createAthleteDataStore(db).forAthlete(MISSING_ATHLETE);
    const result = await otherStore.upsertGoal({ id: goals[0]!.id, status: "abandoned" });
    expect(result).toBeNull();
  });
});
