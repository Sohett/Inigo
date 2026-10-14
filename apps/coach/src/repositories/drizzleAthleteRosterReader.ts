import { desc, eq, sql } from "drizzle-orm";
import { athlete, trainingPlan, weeklyProposition, type Db } from "@inigo/db";
import type { AthleteRosterEntry } from "../domain/athleteRoster";
import type { AthleteRosterReader } from "../use-cases/listAdminAthletes";

/** One roster query row: the athlete, then the two lateral joins (all null when there is no match). */
export interface AthleteRosterRow {
  id: string;
  displayName: string | null;
  phoneNum: string | null;
  whatsappLid: string | null;
  status: AthleteRosterEntry["status"];
  createdAt: Date;
  planName: string | null;
  planStatus: NonNullable<AthleteRosterEntry["plan"]>["status"] | null;
  propositionWeekStart: string | null;
  propositionStatus: NonNullable<AthleteRosterEntry["latestProposition"]>["status"] | null;
}

/** Map the query row onto the domain entry. Exported so it can be unit-tested without a database. */
export function toAthleteRosterEntry(row: AthleteRosterRow): AthleteRosterEntry {
  return {
    id: row.id,
    displayName: row.displayName,
    phoneNum: row.phoneNum,
    whatsappLid: row.whatsappLid,
    status: row.status,
    createdAt: row.createdAt,
    plan:
      row.planName !== null && row.planStatus !== null
        ? { name: row.planName, status: row.planStatus }
        : null,
    latestProposition:
      row.propositionWeekStart !== null && row.propositionStatus !== null
        ? { weekStart: row.propositionWeekStart, status: row.propositionStatus }
        : null
  };
}

/**
 * Drizzle-backed `AthleteRosterReader`: one query, each athlete left-joined laterally with
 * their plan (the active one first, else the most recent) and their latest proposition.
 */
export function createDrizzleAthleteRosterReader(db: Db): AthleteRosterReader {
  return {
    async listRoster(): Promise<AthleteRosterEntry[]> {
      const plan = db
        .select({ name: trainingPlan.name, status: trainingPlan.status })
        .from(trainingPlan)
        .where(eq(trainingPlan.athleteId, athlete.id))
        .orderBy(sql`(${trainingPlan.status} = 'active') desc`, desc(trainingPlan.createdAt))
        .limit(1)
        .as("roster_plan");
      const proposition = db
        .select({ weekStart: weeklyProposition.weekStart, status: weeklyProposition.status })
        .from(weeklyProposition)
        .where(eq(weeklyProposition.athleteId, athlete.id))
        .orderBy(desc(weeklyProposition.weekStart), desc(weeklyProposition.createdAt))
        .limit(1)
        .as("roster_proposition");

      const rows = await db
        .select({
          id: athlete.id,
          displayName: athlete.displayName,
          phoneNum: athlete.phoneNum,
          whatsappLid: athlete.whatsappLid,
          status: athlete.status,
          createdAt: athlete.createdAt,
          planName: plan.name,
          planStatus: plan.status,
          propositionWeekStart: proposition.weekStart,
          propositionStatus: proposition.status
        })
        .from(athlete)
        .leftJoinLateral(plan, sql`true`)
        .leftJoinLateral(proposition, sql`true`)
        .orderBy(athlete.createdAt);
      return rows.map(toAthleteRosterEntry);
    }
  };
}
