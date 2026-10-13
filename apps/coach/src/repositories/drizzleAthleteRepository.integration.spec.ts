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
    const found = await repo.findBySender({ phone: TEST_PHONE, lid: null });
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe(athleteId);
    expect(found[0]!.phoneNum).toBe(TEST_PHONE);
    expect(found[0]!.activeSession).toEqual({ sessionId: "sesn_test", agentId: "agent_test" });
  });

  it("finds an athlete by WhatsApp LID", async () => {
    const repo = createDrizzleAthleteRepository(db);
    const found = await repo.findBySender({ phone: null, lid: TEST_LID });
    expect(found.map(({ id }) => id)).toEqual([athleteId]);
  });

  it("finds the athlete once when both aliases are theirs", async () => {
    const repo = createDrizzleAthleteRepository(db);
    const found = await repo.findBySender({ phone: TEST_PHONE, lid: TEST_LID });
    expect(found.map(({ id }) => id)).toEqual([athleteId]);
  });

  it("finds the athlete by one alias when the other is unknown", async () => {
    const repo = createDrizzleAthleteRepository(db);
    const found = await repo.findBySender({ phone: TEST_PHONE, lid: "000000000000000@lid" });
    expect(found.map(({ id }) => id)).toEqual([athleteId]);
  });

  it("finds nobody for unknown aliases, or none at all", async () => {
    const repo = createDrizzleAthleteRepository(db);
    expect(await repo.findBySender({ phone: "+329999999999", lid: "000000000000000@lid" })).toEqual([]);
    expect(await repo.findBySender({ phone: null, lid: null })).toEqual([]);
  });

  it("remembers a sender's aliases and reply address", async () => {
    const repo = createDrizzleAthleteRepository(db);
    await repo.rememberSender(athleteId, { chatId: "320000000005@c.us" });
    const [found] = await repo.findBySender({ phone: TEST_PHONE, lid: null });
    expect(found).toMatchObject({ chatId: "320000000005@c.us", whatsappLid: TEST_LID });
  });

  it("finds two athletes when the LID and the number belong to different ones", async () => {
    const repo = createDrizzleAthleteRepository(db);
    const otherLid = "990000000000009@lid"; // reserved test LID, never a real athlete
    await db.delete(athlete).where(eq(athlete.whatsappLid, otherLid));
    const [other] = await db.insert(athlete).values({ whatsappLid: otherLid }).returning({ id: athlete.id });
    try {
      const found = await repo.findBySender({ phone: TEST_PHONE, lid: otherLid });
      expect(found.map(({ id }) => id).sort()).toEqual([athleteId, other!.id].sort());
    } finally {
      await db.delete(athlete).where(eq(athlete.whatsappLid, otherLid));
    }
  });

  it("switches the live session while keeping the previous one in the history", async () => {
    const repo = createDrizzleAthleteRepository(db);
    await repo.setSession(athleteId, "sesn_test_2", "agent_test");

    const found = await repo.findById(athleteId);
    expect(found!.activeSession?.sessionId).toBe("sesn_test_2");

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

  it("registers a LID-only athlete in onboarding with its session, and refuses it twice", async () => {
    const repo = createDrizzleAthleteRepository(db);
    const lid = "990000000000007@lid"; // reserved test LID, never a real athlete
    await db.delete(athlete).where(eq(athlete.whatsappLid, lid));
    const input = {
      phoneNum: null,
      whatsappLid: lid,
      chatId: lid,
      session: { sessionId: "sesn_test_onboarding", agentId: "agent_test_onboarding" }
    };
    try {
      const registered = await repo.registerOnboardingAthlete(input);
      expect(registered).toMatchObject({
        phoneNum: null,
        whatsappLid: lid,
        status: "onboarding",
        activeSession: { sessionId: "sesn_test_onboarding", agentId: "agent_test_onboarding" }
      });
      expect(
        await repo.registerOnboardingAthlete({ ...input, session: { ...input.session, sessionId: "sesn_test_dup" } })
      ).toBeNull();
    } finally {
      await db.delete(athlete).where(eq(athlete.whatsappLid, lid));
    }
  });

  it("completes an onboarding: the athlete turns active on the coordinator's session", async () => {
    const repo = createDrizzleAthleteRepository(db);
    const lid = "990000000000008@lid"; // reserved test LID, never a real athlete
    await db.delete(athlete).where(eq(athlete.whatsappLid, lid));
    try {
      const registered = await repo.registerOnboardingAthlete({
        phoneNum: null,
        whatsappLid: lid,
        chatId: lid,
        session: { sessionId: "sesn_test_onboarding_2", agentId: "agent_test_onboarding" }
      });
      await repo.completeOnboarding(registered!.id, "sesn_test_coordinator", "agent_test_coordinator");

      expect(await repo.findById(registered!.id)).toMatchObject({
        status: "active",
        activeSession: { sessionId: "sesn_test_coordinator", agentId: "agent_test_coordinator" }
      });
      const sessions = await repo.listSessions(registered!.id);
      expect(sessions.map((session) => [session.sessionId, session.endedAt === null])).toEqual([
        ["sesn_test_coordinator", true],
        ["sesn_test_onboarding_2", false]
      ]);
    } finally {
      await db.delete(athlete).where(eq(athlete.whatsappLid, lid));
    }
  });
});
