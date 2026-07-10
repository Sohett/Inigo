import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  athlete,
  athleteProfile,
  athleteThreshold,
  createDb,
  goal,
  planBlock,
  trainingPlan,
  type Db
} from "@inigo/db";
import { createAthleteDataRepository } from "./athleteDataRepository";

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

describe.skipIf(!databaseUrl)("athleteDataRepository (integration)", () => {
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
    const store = createAthleteDataRepository(db).forAthlete(athleteId);
    const profile = await store.getProfile();
    expect(profile).not.toBeNull();
    expect(profile!.displayName).toBe("Store Integration");
    expect(profile!.profile?.healthNotes).toBe("seed health");
    expect(profile).not.toHaveProperty("phoneNum");
    expect(JSON.stringify(profile)).not.toContain(TEST_PHONE);
  });

  it("returns null for an unknown athlete", async () => {
    const store = createAthleteDataRepository(db).forAthlete(MISSING_ATHLETE);
    expect(await store.getProfile()).toBeNull();
  });

  it("reads the latest threshold per sport", async () => {
    const store = createAthleteDataRepository(db).forAthlete(athleteId);
    const thresholds = await store.getThresholds();
    expect(thresholds.find((t) => t.sport === "bike")?.ftpWatts).toBe(282);
  });

  it("reads active goals", async () => {
    const store = createAthleteDataRepository(db).forAthlete(athleteId);
    const goals = await store.getGoals();
    expect(goals.some((g) => g.title === "Seed goal")).toBe(true);
  });

  it("updates profile notes (upsert)", async () => {
    const store = createAthleteDataRepository(db).forAthlete(athleteId);
    await store.updateProfile({ healthNotes: "updated health" });
    const profile = await store.getProfile();
    expect(profile!.profile?.healthNotes).toBe("updated health");
  });

  it("appends an adaptation-log entry and reads it back", async () => {
    const store = createAthleteDataRepository(db).forAthlete(athleteId);
    await store.logAdaptation({ summary: "integration entry", author: "test" });
    const log = await store.getAdaptationLog();
    expect(log.some((e) => e.summary === "integration entry")).toBe(true);
  });

  it("creates then updates a goal", async () => {
    const store = createAthleteDataRepository(db).forAthlete(athleteId);
    const created = await store.upsertGoal({ title: "Created goal", status: "active" });
    expect(created?.id).toBeDefined();
    const updated = await store.upsertGoal({ id: created!.id, status: "achieved" });
    expect(updated?.status).toBe("achieved");
  });

  it("does not update another athlete's goal (scoping)", async () => {
    const ours = createAthleteDataRepository(db).forAthlete(athleteId);
    const goals = await ours.getGoals();
    const otherStore = createAthleteDataRepository(db).forAthlete(MISSING_ATHLETE);
    const result = await otherStore.upsertGoal({ id: goals[0]!.id, status: "abandoned" });
    expect(result).toBeNull();
  });

  it("creates a training plan with blocks and reads it back (dates as YYYY-MM-DD)", async () => {
    const store = createAthleteDataRepository(db).forAthlete(athleteId);
    const saved = await store.saveTrainingPlan({
      name: "Test season",
      startDate: "2026-07-06",
      endDate: "2026-09-20",
      status: "active",
      createdBy: "ai",
      rationale: "test macro rationale",
      blocks: [
        {
          name: "Base",
          phaseType: "base",
          startDate: "2026-07-06",
          endDate: "2026-07-19",
          focus: "volume",
          weeklyTargets: [{ weekStart: "2026-07-06", plannedTss: 500 }]
        },
        { name: "Build", phaseType: "build", startDate: "2026-07-20", endDate: "2026-08-02" }
      ]
    });
    expect(saved).not.toBeNull();
    // Dates normalised with no timezone shift (Neon parses `date` into local Date objects).
    expect(saved!.startDate).toBe("2026-07-06");
    expect(saved!.endDate).toBe("2026-09-20");
    expect(saved!.blocks).toHaveLength(2);
    expect(saved!.blocks[0]!.orderIndex).toBe(0);
    expect(saved!.blocks[0]!.startDate).toBe("2026-07-06");

    const readBack = await store.getTrainingPlan();
    expect(readBack!.name).toBe("Test season");
    expect(readBack!.rationale).toBe("test macro rationale");
    expect(readBack!.blocks).toHaveLength(2);
    expect(readBack!.startDate).toBe("2026-07-06");
  });

  it("updates a plan and replaces/reorders its blocks atomically", async () => {
    const store = createAthleteDataRepository(db).forAthlete(athleteId);
    const created = await store.saveTrainingPlan({
      name: "Replace me",
      startDate: "2026-07-06",
      endDate: "2026-09-20",
      status: "active",
      blocks: [
        { name: "one", startDate: "2026-07-06", endDate: "2026-07-12" },
        { name: "two", startDate: "2026-07-13", endDate: "2026-07-19" }
      ]
    });
    const planId = created!.id;

    const updated = await store.saveTrainingPlan({
      id: planId,
      name: "Replaced",
      startDate: "2026-07-06",
      endDate: "2026-09-20",
      rationale: "updated rationale",
      blocks: [{ name: "only", startDate: "2026-07-06", endDate: "2026-07-12" }]
    });
    expect(updated!.id).toBe(planId);
    expect(updated!.name).toBe("Replaced");
    expect(updated!.rationale).toBe("updated rationale");
    expect(updated!.blocks).toHaveLength(1);
    expect(updated!.blocks[0]!.name).toBe("only");
    expect(updated!.blocks[0]!.orderIndex).toBe(0);
  });

  it("archives the previous active plan when a new one is set active", async () => {
    const store = createAthleteDataRepository(db).forAthlete(athleteId);
    const first = await store.saveTrainingPlan({
      name: "First active",
      startDate: "2026-01-01",
      endDate: "2026-02-01",
      status: "active",
      blocks: [{ startDate: "2026-01-01", endDate: "2026-01-07" }]
    });
    const second = await store.saveTrainingPlan({
      name: "Second active",
      startDate: "2026-03-01",
      endDate: "2026-04-01",
      status: "active",
      blocks: [{ startDate: "2026-03-01", endDate: "2026-03-07" }]
    });

    const current = await store.getTrainingPlan();
    expect(current!.id).toBe(second!.id);

    const firstRow = await db
      .select()
      .from(trainingPlan)
      .where(eq(trainingPlan.id, first!.id))
      .limit(1);
    expect(firstRow[0]!.status).toBe("archived");
  });

  it("cannot save over another athlete's plan and leaves its blocks intact (scoping)", async () => {
    const owner = createAthleteDataRepository(db).forAthlete(athleteId);
    const created = await owner.saveTrainingPlan({
      name: "Owned",
      startDate: "2026-05-01",
      endDate: "2026-06-01",
      status: "active",
      blocks: [
        { name: "keep-1", startDate: "2026-05-01", endDate: "2026-05-07" },
        { name: "keep-2", startDate: "2026-05-08", endDate: "2026-05-14" }
      ]
    });
    const planId = created!.id;

    const intruder = createAthleteDataRepository(db).forAthlete(MISSING_ATHLETE);
    const result = await intruder.saveTrainingPlan({
      id: planId,
      name: "Hijacked",
      startDate: "2026-05-01",
      endDate: "2026-06-01",
      blocks: [{ startDate: "2026-05-01", endDate: "2026-05-07" }]
    });
    expect(result).toBeNull();

    // The owner's plan and its two blocks are untouched (the delete never ran).
    const ownRow = await db
      .select()
      .from(trainingPlan)
      .where(eq(trainingPlan.id, planId))
      .limit(1);
    expect(ownRow[0]!.name).toBe("Owned");
    const ownBlocks = await db.select().from(planBlock).where(eq(planBlock.planId, planId));
    expect(ownBlocks).toHaveLength(2);
  });
});
