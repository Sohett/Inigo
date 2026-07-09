import { and, asc, desc, eq, gte } from "drizzle-orm";
import {
  adaptationLog,
  athlete,
  athleteProfile,
  athleteThreshold,
  goal,
  planBlock,
  trainingPlan,
  type Db
} from "@inigo/db";
import type {
  AdaptationTrigger,
  AthleteConstraints,
  CoachingTargets,
  GoalPriority,
  GoalStatus,
  GoalType,
  Sport
} from "@inigo/db";

/**
 * Neon access layer for the athlete-data MCP. This is the single seam that knows the
 * `@inigo/db` schema (mirroring `drizzleAthleteRepository` for routing): every query is
 * scoped to one `athleteId`, so a session can only ever touch its own athlete's data.
 *
 * Reads are typed by Drizzle; writes take pre-shaped values (the tools validate inputs
 * with zod before calling in). Nothing here exposes secrets or routing PII — the safe
 * projection for identity lives in `getProfile`.
 */

/** Fields a write may set on the 1:1 profile — "simple notes/preferences" only. */
export interface ProfilePatch {
  weightTargetKg?: string;
  constraints?: AthleteConstraints;
  constraintsNotes?: string;
  healthNotes?: string;
  coachingTargets?: CoachingTargets;
}

/** An append to the coaching journal. `summary` is required; the rest is optional context. */
export interface AdaptationEntry {
  summary: string;
  author?: string;
  trigger?: AdaptationTrigger;
  detail?: Record<string, unknown>;
  relatedWeek?: string;
}

/** A goal create (no `id`) or update (`id` present); scoped to the athlete on write. */
export interface GoalInput {
  id?: string;
  title?: string;
  description?: string;
  type?: GoalType;
  targetDate?: string;
  priority?: GoalPriority;
  status?: GoalStatus;
  intervalsEventId?: string;
}

export function createAthleteDataStore(db: Db) {
  return {
    /** Bind every query to one athlete. The returned methods never take an athleteId. */
    forAthlete(athleteId: string) {
      return {
        /**
         * Identity (safe columns only) + the 1:1 profile. Returns null when the athlete
         * is unknown. Never selects phone_num, whatsapp_lid, chat_id, or the session/
         * agent/memory pointers — those are routing internals, not coaching data.
         */
        async getProfile() {
          const identityRows = await db
            .select({
              displayName: athlete.displayName,
              timezone: athlete.timezone,
              locale: athlete.locale,
              status: athlete.status
            })
            .from(athlete)
            .where(eq(athlete.id, athleteId))
            .limit(1);
          const identity = identityRows[0];
          if (!identity) return null;
          // Explicit projection (like the identity select above): `athlete_profile` holds
          // only coaching data today, but projecting deliberately keeps the "no secret/PII"
          // guarantee resilient if a column is ever added — the caller chooses what is exposed.
          const profileRows = await db
            .select({
              birthDate: athleteProfile.birthDate,
              sex: athleteProfile.sex,
              heightCm: athleteProfile.heightCm,
              weightKg: athleteProfile.weightKg,
              weightTargetKg: athleteProfile.weightTargetKg,
              restingHr: athleteProfile.restingHr,
              maxHr: athleteProfile.maxHr,
              constraints: athleteProfile.constraints,
              constraintsNotes: athleteProfile.constraintsNotes,
              healthNotes: athleteProfile.healthNotes,
              coachingTargets: athleteProfile.coachingTargets,
              updatedAt: athleteProfile.updatedAt
            })
            .from(athleteProfile)
            .where(eq(athleteProfile.athleteId, athleteId))
            .limit(1);
          return { athleteId, ...identity, profile: profileRows[0] ?? null };
        },

        /** Current thresholds = the latest row per sport (optionally filtered to one sport). */
        async getThresholds(sport?: Sport) {
          const rows = await db
            .select()
            .from(athleteThreshold)
            .where(
              sport
                ? and(eq(athleteThreshold.athleteId, athleteId), eq(athleteThreshold.sport, sport))
                : eq(athleteThreshold.athleteId, athleteId)
            )
            .orderBy(desc(athleteThreshold.effectiveDate));
          const latestPerSport = new Map<string, (typeof rows)[number]>();
          for (const row of rows) {
            if (!latestPerSport.has(row.sport)) latestPerSport.set(row.sport, row);
          }
          return [...latestPerSport.values()];
        },

        /** Goals for the athlete, filtered by status (default `active`), soonest target first. */
        async getGoals(status: GoalStatus = "active") {
          return db
            .select()
            .from(goal)
            .where(and(eq(goal.athleteId, athleteId), eq(goal.status, status)))
            .orderBy(asc(goal.targetDate));
        },

        /** The current plan (active if any, else most recent) with its ordered blocks. */
        async getTrainingPlan() {
          const activeRows = await db
            .select()
            .from(trainingPlan)
            .where(and(eq(trainingPlan.athleteId, athleteId), eq(trainingPlan.status, "active")))
            .orderBy(desc(trainingPlan.startDate))
            .limit(1);
          let plan = activeRows[0];
          if (!plan) {
            const recentRows = await db
              .select()
              .from(trainingPlan)
              .where(eq(trainingPlan.athleteId, athleteId))
              .orderBy(desc(trainingPlan.startDate))
              .limit(1);
            plan = recentRows[0];
          }
          if (!plan) return null;
          const blocks = await db
            .select()
            .from(planBlock)
            .where(eq(planBlock.planId, plan.id))
            .orderBy(asc(planBlock.orderIndex));
          return { plan, blocks };
        },

        /** Most recent adaptation-log entries, newest first (default 20), optionally since a date. */
        async getAdaptationLog(options: { limit?: number; since?: string } = {}) {
          const limit = options.limit ?? 20;
          const where = options.since
            ? and(
                eq(adaptationLog.athleteId, athleteId),
                gte(adaptationLog.occurredAt, new Date(options.since))
              )
            : eq(adaptationLog.athleteId, athleteId);
          return db
            .select()
            .from(adaptationLog)
            .where(where)
            .orderBy(desc(adaptationLog.occurredAt))
            .limit(limit);
        },

        /** Upsert the 1:1 profile (PK = athlete_id); only the provided fields change. */
        async updateProfile(patch: ProfilePatch) {
          await db
            .insert(athleteProfile)
            .values({ athleteId, ...patch })
            .onConflictDoUpdate({ target: athleteProfile.athleteId, set: patch });
          return this.getProfile();
        },

        /** Append one entry to the coaching journal (adaptation_log is append-only). */
        async logAdaptation(entry: AdaptationEntry) {
          const rows = await db
            .insert(adaptationLog)
            .values({ athleteId, ...entry })
            .returning();
          return rows[0] ?? null;
        },

        /**
         * Create a goal, or update an existing one. On update the `id` is matched together
         * with `athleteId`, so a session can never edit another athlete's goal (returns null
         * if the id is unknown or not owned).
         */
        async upsertGoal(input: GoalInput) {
          const { id, ...values } = input;
          if (id) {
            const rows = await db
              .update(goal)
              .set(values)
              .where(and(eq(goal.id, id), eq(goal.athleteId, athleteId)))
              .returning();
            return rows[0] ?? null;
          }
          const rows = await db
            .insert(goal)
            .values({ athleteId, ...values, title: values.title ?? "" })
            .returning();
          return rows[0] ?? null;
        }
      };
    }
  };
}

export type AthleteDataStore = ReturnType<typeof createAthleteDataStore>;
export type ScopedAthleteDataStore = ReturnType<AthleteDataStore["forAthlete"]>;
