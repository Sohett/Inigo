import { eq } from "drizzle-orm";
import { athlete, type Db } from "@inigo/db";
import type { Athlete } from "../domain/athlete";
import type { AthleteRepository } from "./athleteRepository";

type AthleteRow = typeof athlete.$inferSelect;

/**
 * Map a DB row onto the domain `Athlete`. This is the single seam where DB types
 * become business types: a column rename or a JSONB reshape stays contained here.
 * Exported so it can be unit-tested without a database.
 */
export function toAthlete(row: AthleteRow): Athlete {
  return {
    id: row.id,
    displayName: row.displayName,
    phoneNum: row.phoneNum,
    whatsappLid: row.whatsappLid,
    chatId: row.chatId,
    status: row.status,
    anthropicSessionId: row.anthropicSessionId,
    managedAgentId: row.managedAgentId
  };
}

/**
 * Drizzle-backed `AthleteRepository`. The only layer aware of the ORM: it runs the
 * query against the shared Neon schema and maps rows to the domain model.
 */
export function createDrizzleAthleteRepository(db: Db): AthleteRepository {
  return {
    async findByPhone(phoneNum: string): Promise<Athlete | null> {
      const rows = await db.select().from(athlete).where(eq(athlete.phoneNum, phoneNum)).limit(1);
      const row = rows[0];
      return row ? toAthlete(row) : null;
    },
    async findByLid(whatsappLid: string): Promise<Athlete | null> {
      const rows = await db.select().from(athlete).where(eq(athlete.whatsappLid, whatsappLid)).limit(1);
      const row = rows[0];
      return row ? toAthlete(row) : null;
    },
    async setChatId(athleteId: string, chatId: string): Promise<void> {
      // `updated_at` auto-bumps via the column's `$onUpdate`, so no manual set is needed.
      await db.update(athlete).set({ chatId }).where(eq(athlete.id, athleteId));
    }
  };
}
