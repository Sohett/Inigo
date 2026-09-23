import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { athlete, athleteSession, type Db } from "@inigo/db";
import type { Athlete, AthleteSession } from "../domain/athlete";
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
    findByPhone(phoneNum: string): Promise<Athlete | null> {
      return findOne(eq(athlete.phoneNum, phoneNum));
    },
    findByLid(whatsappLid: string): Promise<Athlete | null> {
      return findOne(eq(athlete.whatsappLid, whatsappLid));
    },
    async setChatId(athleteId: string, chatId: string): Promise<void> {
      // `updated_at` auto-bumps via the column's `$onUpdate`, so no manual set is needed.
      await db.update(athlete).set({ chatId }).where(eq(athlete.id, athleteId));
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
