import { and, eq, isNotNull, sql } from "drizzle-orm";
import { athlete, athleteCredential, athleteProfile, goal, type Db } from "@inigo/db";
import type { OnboardingFacts } from "../domain/onboarding";
import type { OnboardingFactsReader } from "../use-cases/assessOnboarding";

/** One athlete with its profile (left-joined, so every profile column may be null). */
export interface OnboardingFactsRow {
  motivation: string | null;
  trainingBackground: string | null;
  weeklyHours: string | null;
  ftpStatus: OnboardingFacts["ftpStatus"];
  educationDone: boolean | null;
  activeGoalCount: number;
  intervalsConnected: boolean;
}

/** Map the query row onto the domain facts. Exported so it can be unit-tested without a database. */
export function toOnboardingFacts(row: OnboardingFactsRow): OnboardingFacts {
  return {
    intervalsConnected: row.intervalsConnected,
    motivation: row.motivation,
    trainingBackground: row.trainingBackground,
    activeGoalCount: row.activeGoalCount,
    weeklyHours: row.weeklyHours,
    ftpStatus: row.ftpStatus,
    educationDone: row.educationDone ?? false
  };
}

/**
 * Drizzle-backed `OnboardingFactsReader`: one query reads the profile, counts the active
 * goals and checks for a usable Intervals.icu credential (key and Intervals athlete id,
 * the two things the Intervals resolver needs). The secret itself is never selected.
 */
export function createDrizzleOnboardingFactsReader(db: Db): OnboardingFactsReader {
  return {
    async getOnboardingFacts(athleteId: string): Promise<OnboardingFacts | null> {
      const activeGoalCount = db.$count(
        goal,
        and(eq(goal.athleteId, athlete.id), eq(goal.status, "active"))
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
          motivation: athleteProfile.motivation,
          trainingBackground: athleteProfile.trainingBackground,
          weeklyHours: athleteProfile.weeklyHours,
          ftpStatus: athleteProfile.ftpStatus,
          educationDone: athleteProfile.educationDone,
          activeGoalCount,
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
