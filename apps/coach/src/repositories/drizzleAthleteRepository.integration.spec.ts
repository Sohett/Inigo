import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { athlete, athleteSession, createDb, type Db } from "@inigo/db";
import { createDrizzleAthleteRepository } from "./drizzleAthleteRepository";

/**
 * Live round-trip of the inline adapter query against a real Neon branch. Skipped
 * unless DATABASE_URL is set, so `pnpm verify` stays offline and green in CI. The
 * query text lives in the coach adapter (not @inigo/db), so this is where it is
 * exercised end-to-end. Provisions and tears down its own athlete row (its sessions
 * go with it by cascade).
 *
 * Run it with:
 *   DATABASE_URL=postgres://... pnpm --filter @inigo/coach test
 */
const databaseUrl = process.env.DATABASE_URL;
const TEST_PHONE = "+320000000005"; // reserved test number, never a real athlete
const TEST_LID = "990000000000005@lid"; // reserved test LID, never a real athlete

describe.skipIf(!databaseUrl)("drizzleAthleteRepository (integration)", () => {
  let db: Db;
  let athleteId: string;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await db.delete(athlete).where(eq(athlete.phoneNum, TEST_PHONE));
    const inserted = await db
      .insert(athlete)
      .values({
        phoneNum: TEST_PHONE,
        whatsappLid: TEST_LID,
        displayName: "Repo Integration"
      })
      .returning({ id: athlete.id });
    const row = inserted[0];
    expect(row).toBeDefined();
    athleteId = row!.id;
    await db
      .insert(athleteSession)
      .values({ athleteId, anthropicSessionId: "sesn_test", managedAgentId: "agent_test" });
  });

  afterAll(async () => {
    if (db && athleteId) {
      await db.delete(athlete).where(eq(athlete.id, athleteId));
    }
  });

  it("finds an athlete by phone and maps it to the domain model", async () => {
    const repo = createDrizzleAthleteRepository(db);
    const found = await repo.findByPhone(TEST_PHONE);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(athleteId);
    expect(found!.phoneNum).toBe(TEST_PHONE);
    expect(found!.anthropicSessionId).toBe("sesn_test");
    expect(found!.managedAgentId).toBe("agent_test");
  });

  it("returns null for an unknown phone", async () => {
    const repo = createDrizzleAthleteRepository(db);
    expect(await repo.findByPhone("+329999999999")).toBeNull();
  });

  it("finds an athlete by WhatsApp LID and maps it to the domain model", async () => {
    const repo = createDrizzleAthleteRepository(db);
    const found = await repo.findByLid(TEST_LID);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(athleteId);
    expect(found!.whatsappLid).toBe(TEST_LID);
  });

  it("returns null for an unknown LID", async () => {
    const repo = createDrizzleAthleteRepository(db);
    expect(await repo.findByLid("000000000000000@lid")).toBeNull();
  });

  it("persists chat_id", async () => {
    const repo = createDrizzleAthleteRepository(db);
    await repo.setChatId(athleteId, "320000000005@c.us");
    const found = await repo.findByPhone(TEST_PHONE);
    expect(found!.chatId).toBe("320000000005@c.us");
  });

  it("switches the live session while keeping the previous one in the history", async () => {
    const repo = createDrizzleAthleteRepository(db);
    await repo.setSession(athleteId, "sesn_test_2", "agent_test");

    const found = await repo.findById(athleteId);
    expect(found!.anthropicSessionId).toBe("sesn_test_2");

    const sessions = await repo.listSessions(athleteId);
    expect(sessions.map((session) => session.sessionId)).toEqual(["sesn_test_2", "sesn_test"]);
    expect(sessions[0]!.endedAt).toBeNull();
    expect(sessions[1]!.endedAt).toBeInstanceOf(Date);
  });

  it("refuses a second live session for the same athlete", async () => {
    await expect(
      db.insert(athleteSession).values({ athleteId, anthropicSessionId: "sesn_test_rogue", managedAgentId: "agent_test" })
    ).rejects.toThrow();
  });
});
