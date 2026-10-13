import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { athlete, athleteSession, type Db } from "@inigo/db";
import type { Athlete, AthleteSession, NewOnboardingAthlete, SenderChanges, SenderIdentity } from "../domain/athlete";
import type { AthleteRepository } from "./athleteRepository";

type AthleteRow = typeof athlete.$inferSelect;
type AthleteSessionRow = typeof athleteSession.$inferSelect;

/**
 * Map a DB row, joined with the athlete's live session if any, onto the domain `Athlete`.
 * This is the single seam where DB types become business types: a column rename or a
 * table split stays contained here. Exported so it can be unit-tested without a database.
 */
export function toAthlete(row: AthleteRow, liveSession: AthleteSessionRow | null): Athlete {
  return {
    id: row.id,
    displayName: row.displayName,
    phoneNum: row.phoneNum,
    whatsappLid: row.whatsappLid,
    chatId: row.chatId,
    status: row.status,
    activeSession: liveSession
      ? { sessionId: liveSession.anthropicSessionId, agentId: liveSession.managedAgentId }
      : null
  };
}

/** Map a session history row onto the domain `AthleteSession`. Exported for unit tests. */
export function toAthleteSession(row: AthleteSessionRow): AthleteSession {
  return {
    sessionId: row.anthropicSessionId,
    agentId: row.managedAgentId,
    startedAt: row.createdAt,
    endedAt: row.endedAt
  };
}

/** Postgres `unique_violation`, as raised by the driver or wrapped once by Drizzle. */
const UNIQUE_VIOLATION = "23505";

/** Whether a failed write hit a UNIQUE constraint. Exported for unit tests. */
export function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown): unknown =>
    value !== null && typeof value === "object" ? (value as { code?: unknown }).code : undefined;
  const cause = error instanceof Error ? error.cause : undefined;
  return codeOf(error) === UNIQUE_VIOLATION || codeOf(cause) === UNIQUE_VIOLATION;
}

/** The live session of an athlete: the one no newer session has closed. */
function isLiveSessionOf(athleteId: typeof athlete.id | string) {
  return and(eq(athleteSession.athleteId, athleteId), isNull(athleteSession.endedAt));
}

/**
 * Drizzle-backed `AthleteRepository`. The only layer aware of the ORM: it runs the
 * query against the shared Neon schema and maps rows to the domain model.
 */
export function createDrizzleAthleteRepository(db: Db): AthleteRepository {
  /** Athletes joined with their live session (at most one, enforced by a partial unique index). */
  function selectAthletesWithActiveSession() {
    return db
      .select({ athlete, liveSession: athleteSession })
      .from(athlete)
      .leftJoin(athleteSession, isLiveSessionOf(athlete.id));
  }

  async function findOne(where: SQL): Promise<Athlete | null> {
    const rows = await selectAthletesWithActiveSession().where(where).limit(1);
    const row = rows[0];
    return row ? toAthlete(row.athlete, row.liveSession) : null;
  }

  return {
    async findBySender(sender: SenderIdentity): Promise<Athlete[]> {
      const matches = [
        sender.lid ? eq(athlete.whatsappLid, sender.lid) : undefined,
        sender.phone ? eq(athlete.phoneNum, sender.phone) : undefined
      ].filter((match) => match !== undefined);
      if (matches.length === 0) return [];
      // Both aliases are UNIQUE, so at most two rows: the same athlete twice is one row.
      const rows = await selectAthletesWithActiveSession().where(or(...matches)).limit(2);
      return rows.map((row) => toAthlete(row.athlete, row.liveSession));
    },
    async rememberSender(athleteId: string, changes: SenderChanges): Promise<void> {
      // `updated_at` auto-bumps via the column's `$onUpdate`, so no manual set is needed.
      await db.update(athlete).set(changes).where(eq(athlete.id, athleteId));
    },
    findById(athleteId: string): Promise<Athlete | null> {
      return findOne(eq(athlete.id, athleteId));
    },
    async listAll(): Promise<Athlete[]> {
      const rows = await selectAthletesWithActiveSession().orderBy(athlete.createdAt);
      return rows.map((row) => toAthlete(row.athlete, row.liveSession));
    },
    async setSession(athleteId: string, sessionId: string, agentId: string): Promise<void> {
      // Close the live session, then open the new one. Neon's HTTP driver has no interactive
      // transaction, so `db.batch` (one non-interactive Postgres transaction) makes the swap
      // atomic: the athlete is never left without a live session, nor with two. Both sides use
      // the transaction's `now()`, so the old session ends exactly when the new one starts.
      await db.batch([
        db.update(athleteSession).set({ endedAt: sql`now()` }).where(isLiveSessionOf(athleteId)),
        db.insert(athleteSession).values({ athleteId, anthropicSessionId: sessionId, managedAgentId: agentId })
      ]);
    },
    async completeOnboarding(athleteId: string, sessionId: string, agentId: string): Promise<void> {
      // Same swap as `setSession`, with the status change in the same transaction: an athlete is
      // never `active` while still routed to their onboarding session, nor the reverse.
      await db.batch([
        db.update(athlete).set({ status: "active" }).where(eq(athlete.id, athleteId)),
        db.update(athleteSession).set({ endedAt: sql`now()` }).where(isLiveSessionOf(athleteId)),
        db.insert(athleteSession).values({ athleteId, anthropicSessionId: sessionId, managedAgentId: agentId })
      ]);
    },
    async registerOnboardingAthlete(input: NewOnboardingAthlete): Promise<Athlete | null> {
      // The id is chosen here so the athlete and its session go in one batch (a single
      // Postgres transaction over Neon HTTP): never an athlete without a session to route to.
      const athleteId = randomUUID();
      try {
        await db.batch([
          db.insert(athlete).values({
            id: athleteId,
            phoneNum: input.phoneNum,
            whatsappLid: input.whatsappLid,
            chatId: input.chatId,
            status: "onboarding"
          }),
          db.insert(athleteSession).values({
            athleteId,
            anthropicSessionId: input.session.sessionId,
            managedAgentId: input.session.agentId
          })
        ]);
      } catch (error) {
        // Two first messages racing: the other one already registered this phone or LID.
        if (isUniqueViolation(error)) return null;
        throw error;
      }
      return findOne(eq(athlete.id, athleteId));
    },
    async listSessions(athleteId: string): Promise<AthleteSession[]> {
      const rows = await db
        .select()
        .from(athleteSession)
        .where(eq(athleteSession.athleteId, athleteId))
        .orderBy(desc(athleteSession.createdAt));
      return rows.map(toAthleteSession);
    }
  };
}
