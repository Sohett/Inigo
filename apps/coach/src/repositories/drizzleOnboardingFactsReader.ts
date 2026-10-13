import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { athlete, athleteCredential, athleteProfile, goal, type Db } from "@inigo/db";
import type { OnboardingFacts } from "../domain/onboarding";
import type { OnboardingFactsReader } from "../use-cases/assessOnboarding";

/** One athlete with its profile (left-joined, so every profile column may be null). */
export interface OnboardingFactsRow {
  displayName: string | null;
  motivation: string | null;
  trainingBackground: string | null;
  pastCoaching: string | null;
  coachExpectations: string | null;
  weeklyHours: string | null;
  ftpStatus: OnboardingFacts["ftpStatus"];
  educationDone: boolean | null;
  activeGoalCount: number;
  detailedGoalCount: number;
  intervalsConnected: boolean;
}

/** Map the query row onto the domain facts. Exported so it can be unit-tested without a database. */
export function toOnboardingFacts(row: OnboardingFactsRow): OnboardingFacts {
  return {
    intervalsConnected: row.intervalsConnected,
    displayName: row.displayName,
    motivation: row.motivation,
    trainingBackground: row.trainingBackground,
    activeGoalCount: row.activeGoalCount,
    detailedGoalCount: row.detailedGoalCount,
    pastCoaching: row.pastCoaching,
    coachExpectations: row.coachExpectations,
    weeklyHours: row.weeklyHours,
    ftpStatus: row.ftpStatus,
    educationDone: row.educationDone ?? false
  };
}

/**
 * Drizzle-backed `OnboardingFactsReader`: one query reads the athlete and its profile, counts
 * the active goals (and those with their target result and experience told) and checks for a usable Intervals.icu credential (key and Intervals athlete id,
 * the two things the Intervals resolver needs). The secret itself is never selected.
 */
export function createDrizzleOnboardingFactsReader(db: Db): OnboardingFactsReader {
  return {
    async getOnboardingFacts(athleteId: string): Promise<OnboardingFacts | null> {
      const activeGoalCount = db.$count(
        goal,
        and(eq(goal.athleteId, athlete.id), eq(goal.status, "active"))
      );
      const detailedGoalCount = db.$count(
        goal,
        and(
          eq(goal.athleteId, athlete.id),
          eq(goal.status, "active"),
          ne(sql`trim(${goal.targetResult})`, ""),
          ne(sql`trim(${goal.experience})`, "")
        )
      );
      const credential = db
        .select({ id: athleteCredential.id })
        .from(athleteCredential)
        .where(
          and(
            eq(athleteCredential.athleteId, athlete.id),
            eq(athleteCredential.provider, "intervals_icu"),
            isNotNull(athleteCredential.externalAthleteId)
          )
        );
      const rows = await db
        .select({
          displayName: athlete.displayName,
          motivation: athleteProfile.motivation,
          trainingBackground: athleteProfile.trainingBackground,
          pastCoaching: athleteProfile.pastCoaching,
          coachExpectations: athleteProfile.coachExpectations,
          weeklyHours: athleteProfile.weeklyHours,
          ftpStatus: athleteProfile.ftpStatus,
          educationDone: athleteProfile.educationDone,
          activeGoalCount,
          detailedGoalCount,
          intervalsConnected: sql<boolean>`exists (${credential})`
        })
        .from(athlete)
        .leftJoin(athleteProfile, eq(athleteProfile.athleteId, athlete.id))
        .where(eq(athlete.id, athleteId))
        .limit(1);
      const row = rows[0];
      return row ? toOnboardingFacts(row) : null;
    }
  };
}
