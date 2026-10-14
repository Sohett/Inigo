import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { athlete, createDb, trainingPlan, weeklyProposition, type Db } from "@inigo/db";
import { createDrizzleAthleteRosterReader } from "./drizzleAthleteRosterReader";

/**
 * Live round-trip of the roster query (lateral joins) against a real Neon branch. Skipped
 * unless DATABASE_URL is set, so `pnpm verify` stays offline and green in CI. Provisions and
 * tears down its own athlete row (plans and propositions go by cascade).
 *
 * Run it with:
 *   DATABASE_URL=postgres://... pnpm --filter @inigo/coach test
 */
const databaseUrl = process.env.DATABASE_URL;
const TEST_PHONE = "+320000000011"; // reserved test number, never a real athlete

describe.skipIf(!databaseUrl)("drizzleAthleteRosterReader (integration)", () => {
  let db: Db;
  let athleteId: string;

  async function ourEntry() {
    const roster = await createDrizzleAthleteRosterReader(db).listRoster();
    return roster.find((entry) => entry.id === athleteId);
  }

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await db.delete(athlete).where(eq(athlete.phoneNum, TEST_PHONE));
    const inserted = await db
      .insert(athlete)
      .values({ phoneNum: TEST_PHONE, status: "active", displayName: "Roster test" })
      .returning({ id: athlete.id });
    athleteId = inserted[0]!.id;
  });

  afterAll(async () => {
    if (db && athleteId) await db.delete(athlete).where(eq(athlete.id, athleteId));
  });

  it("lists an athlete without plan nor proposition", async () => {
    const entry = await ourEntry();
    expect(entry).toMatchObject({
      phoneNum: TEST_PHONE,
      status: "active",
      plan: null,
      latestProposition: null
    });
  });

  it("prefers the active plan over a more recent one, and takes the latest week", async () => {
    await db.insert(trainingPlan).values({
      athleteId,
      name: "Saison active",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
      status: "active"
    });
    await db.insert(trainingPlan).values({
      athleteId,
      name: "Brouillon plus récent",
      startDate: "2027-07-01",
      endDate: "2027-12-31",
      status: "draft"
    });
    await db.insert(weeklyProposition).values([
      { athleteId, weekStart: "2026-10-12", status: "applied" },
      { athleteId, weekStart: "2026-10-19", status: "draft" }
    ]);

    const entry = await ourEntry();
    expect(entry?.plan).toEqual({ name: "Saison active", status: "active" });
    expect(entry?.latestProposition).toEqual({ weekStart: "2026-10-19", status: "draft" });
  });
});
