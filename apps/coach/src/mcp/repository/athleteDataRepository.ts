import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, ne } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
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
import type { GoalStatus, Sport } from "@inigo/db";
import type {
  AdaptationLogEntry,
  AdaptationLogInput,
  CoachProfile,
  Goal,
  GoalInput,
  PlanBlock,
  ProfileDetails,
  ProfilePatch,
  Threshold,
  TrainingPlan,
  TrainingPlanInput
} from "../../domain/coaching";

/**
 * Neon access layer for the athlete-data MCP. This is the single seam that knows the
 * `@inigo/db` schema (mirroring `drizzleAthleteRepository` for routing): every query is
 * scoped to one `athleteId`, so a session can only ever touch its own athlete's data.
 *
 * Reads are mapped from DB rows onto the coaching models in `domain.ts` (row→model, like
 * `toAthlete` for routing), so the DB shape never leaks to the agent; writes take pre-shaped
 * values (the tools validate inputs with zod before calling in). Nothing here exposes secrets
 * or routing PII — the safe projection for identity lives in `getProfile`.
 */

/**
 * Neon's HTTP driver parses `date` columns into local-time `Date` objects even though
 * Drizzle types them as `string`. Normalise both shapes back to a plain `YYYY-MM-DD`
 * with local getters — never `toISOString`, which would re-apply the timezone offset and
 * shift the day.
 */
function toDateString(value: string | Date): string;
function toDateString(value: string | Date | null): string | null;
function toDateString(value: string | Date | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return value.slice(0, 10);
}

/**
 * A `timestamptz` column is a real instant: serialise it as full ISO 8601 (unlike `date`,
 * which is calendar-only). Neon's driver returns a `Date`; a string is normalised defensively.
 */
function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type ThresholdRow = typeof athleteThreshold.$inferSelect;
type GoalRow = typeof goal.$inferSelect;
type AdaptationLogRow = typeof adaptationLog.$inferSelect;
type PlanRow = typeof trainingPlan.$inferSelect;
type BlockRow = typeof planBlock.$inferSelect;

/** Threshold row → coaching model. Drops id/athleteId/createdAt (persistence internals). */
function toThreshold(row: ThresholdRow): Threshold {
  return {
    sport: row.sport,
    effectiveDate: toDateString(row.effectiveDate),
    ftpWatts: row.ftpWatts,
    thresholdHr: row.thresholdHr,
    maxHr: row.maxHr,
    thresholdPaceSPerKm: row.thresholdPaceSPerKm,
    powerZones: row.powerZones,
    hrZones: row.hrZones,
    source: row.source
  };
}

/** Goal row → coaching model. Drops athleteId and the created/updated timestamps. */
function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    targetDate: toDateString(row.targetDate),
    priority: row.priority,
    status: row.status,
    intervalsEventId: row.intervalsEventId
  };
}

/** Adaptation-log row → journal model. Drops athleteId and the plan/proposition/event FKs. */
function toAdaptationLogEntry(row: AdaptationLogRow): AdaptationLogEntry {
  return {
    id: row.id,
    occurredAt: toIsoString(row.occurredAt),
    summary: row.summary,
    author: row.author,
    trigger: row.trigger,
    detail: row.detail,
    relatedWeek: toDateString(row.relatedWeek)
  };
}

/** Plan-block row → model. Drops id/planId; `orderIndex` carries the block order. */
function toPlanBlock(row: BlockRow): PlanBlock {
  return {
    name: row.name,
    phaseType: row.phaseType,
    startDate: toDateString(row.startDate),
    endDate: toDateString(row.endDate),
    focus: row.focus,
    orderIndex: row.orderIndex,
    weeklyTargets: row.weeklyTargets
  };
}

/**
 * Plan + its ordered blocks → the flat `TrainingPlan` model, normalising the date columns.
 * Drops athleteId and the timestamps; nests the mapped blocks under `blocks`.
 */
function toTrainingPlan(plan: PlanRow, blocks: BlockRow[]): TrainingPlan {
  return {
    id: plan.id,
    name: plan.name,
    startDate: toDateString(plan.startDate),
    endDate: toDateString(plan.endDate),
    status: plan.status,
    createdBy: plan.createdBy,
    goalId: plan.goalId,
    rationale: plan.rationale,
    blocks: blocks.map(toPlanBlock)
  };
}

export function createAthleteDataRepository(db: Db) {
  return {
    /** Bind every query to one athlete. The returned methods never take an athleteId. */
    forAthlete(athleteId: string) {
      return {
        /**
         * Identity (safe columns only) + the 1:1 profile. Returns null when the athlete
         * is unknown. Never selects phone_num, whatsapp_lid, chat_id, or the session/
         * agent/memory pointers — those are routing internals, not coaching data.
         */
        async getProfile(): Promise<CoachProfile | null> {
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
          const profileRow = profileRows[0];
          const profile: ProfileDetails | null = profileRow
            ? {
                birthDate: toDateString(profileRow.birthDate),
                sex: profileRow.sex,
                heightCm: profileRow.heightCm,
                weightKg: profileRow.weightKg,
                weightTargetKg: profileRow.weightTargetKg,
                restingHr: profileRow.restingHr,
                maxHr: profileRow.maxHr,
                constraints: profileRow.constraints,
                constraintsNotes: profileRow.constraintsNotes,
                healthNotes: profileRow.healthNotes,
                coachingTargets: profileRow.coachingTargets
              }
            : null;
          return {
            athleteId,
            displayName: identity.displayName ?? "",
            timezone: identity.timezone,
            locale: identity.locale ?? "fr",
            status: identity.status,
            profile
          };
        },

        /** Current thresholds = the latest row per sport (optionally filtered to one sport). */
        async getThresholds(sport?: Sport): Promise<Threshold[]> {
          const rows = await db
            .select()
            .from(athleteThreshold)
            .where(
              sport
                ? and(eq(athleteThreshold.athleteId, athleteId), eq(athleteThreshold.sport, sport))
                : eq(athleteThreshold.athleteId, athleteId)
            )
            .orderBy(desc(athleteThreshold.effectiveDate));
          const latestPerSport = new Map<string, ThresholdRow>();
          for (const row of rows) {
            if (!latestPerSport.has(row.sport)) latestPerSport.set(row.sport, row);
          }
          return [...latestPerSport.values()].map(toThreshold);
        },

        /** Goals for the athlete, filtered by status (default `active`), soonest target first. */
        async getGoals(status: GoalStatus = "active"): Promise<Goal[]> {
          const rows = await db
            .select()
            .from(goal)
            .where(and(eq(goal.athleteId, athleteId), eq(goal.status, status)))
            .orderBy(asc(goal.targetDate));
          return rows.map(toGoal);
        },

        /** The current plan (active if any, else most recent) with its ordered blocks. */
        async getTrainingPlan(): Promise<TrainingPlan | null> {
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
          return toTrainingPlan(plan, blocks);
        },

        /** Most recent adaptation-log entries, newest first (default 20), optionally since a date. */
        async getAdaptationLog(
          options: { limit?: number; since?: string } = {}
        ): Promise<AdaptationLogEntry[]> {
          const limit = options.limit ?? 20;
          const where = options.since
            ? and(
                eq(adaptationLog.athleteId, athleteId),
                gte(adaptationLog.occurredAt, new Date(options.since))
              )
            : eq(adaptationLog.athleteId, athleteId);
          const rows = await db
            .select()
            .from(adaptationLog)
            .where(where)
            .orderBy(desc(adaptationLog.occurredAt))
            .limit(limit);
          return rows.map(toAdaptationLogEntry);
        },

        /** Upsert the 1:1 profile (PK = athlete_id); only the provided fields change. */
        async updateProfile(patch: ProfilePatch): Promise<CoachProfile | null> {
          await db
            .insert(athleteProfile)
            .values({ athleteId, ...patch })
            .onConflictDoUpdate({ target: athleteProfile.athleteId, set: patch });
          return this.getProfile();
        },

        /** Append one entry to the coaching journal (adaptation_log is append-only). */
        async logAdaptation(entry: AdaptationLogInput): Promise<AdaptationLogEntry | null> {
          const rows = await db
            .insert(adaptationLog)
            .values({ athleteId, ...entry })
            .returning();
          const row = rows[0];
          return row ? toAdaptationLogEntry(row) : null;
        },

        /**
         * Create a goal, or update an existing one. On update the `id` is matched together
         * with `athleteId`, so a session can never edit another athlete's goal (returns null
         * if the id is unknown or not owned).
         */
        async upsertGoal(input: GoalInput): Promise<Goal | null> {
          const { id, ...values } = input;
          if (id) {
            const rows = await db
              .update(goal)
              .set(values)
              .where(and(eq(goal.id, id), eq(goal.athleteId, athleteId)))
              .returning();
            const row = rows[0];
            return row ? toGoal(row) : null;
          }
          const rows = await db
            .insert(goal)
            .values({ athleteId, ...values, title: values.title ?? "" })
            .returning();
          const row = rows[0];
          return row ? toGoal(row) : null;
        },

        /**
         * Create a training plan (no `id`) or update an existing one (`id` present), together
         * with its ordered blocks in one atomic write. Blocks are **replace-all**: the provided
         * list fully replaces the plan's blocks, `order_index` recomputed from the array order.
         * Making the plan `active` archives the athlete's other active plans.
         *
         * Scoped to the athlete: on update, ownership is checked first and the write returns
         * null if the plan is unknown or not owned — a session can never touch another athlete's
         * plan or blocks. Neon's HTTP driver has no interactive transaction, so atomicity comes
         * from `db.batch` (a single non-interactive Postgres transaction).
         */
        async saveTrainingPlan(input: TrainingPlanInput): Promise<TrainingPlan | null> {
          const planId = input.id ?? randomUUID();

          // On update, confirm ownership BEFORE building the batch and bail out entirely if the
          // plan is not this athlete's. This guard is load-bearing, not a nicety: the block
          // INSERTs below carry only plan_id, so without it a write aimed at another athlete's
          // plan id would delete the victim's blocks and insert this caller's under the victim's
          // plan. Returning null here is also the sole "not owned" signal the tool maps to
          // not-found.
          if (input.id) {
            const owned = await db
              .select({ id: trainingPlan.id })
              .from(trainingPlan)
              .where(and(eq(trainingPlan.id, input.id), eq(trainingPlan.athleteId, athleteId)))
              .limit(1);
            if (!owned[0]) return null;
          }

          const statements: BatchItem<"pg">[] = [];

          // A single active plan per athlete: making this one active archives the others.
          if (input.status === "active") {
            statements.push(
              db
                .update(trainingPlan)
                .set({ status: "archived", updatedAt: new Date() })
                .where(
                  and(
                    eq(trainingPlan.athleteId, athleteId),
                    eq(trainingPlan.status, "active"),
                    ne(trainingPlan.id, planId)
                  )
                )
            );
          }

          if (input.id) {
            const set: Partial<typeof trainingPlan.$inferInsert> = {
              name: input.name,
              startDate: input.startDate,
              endDate: input.endDate,
              updatedAt: new Date()
            };
            if (input.status !== undefined) set.status = input.status;
            if (input.goalId !== undefined) set.goalId = input.goalId;
            if (input.rationale !== undefined) set.rationale = input.rationale;
            if (input.createdBy !== undefined) set.createdBy = input.createdBy;
            statements.push(
              db
                .update(trainingPlan)
                .set(set)
                .where(and(eq(trainingPlan.id, planId), eq(trainingPlan.athleteId, athleteId)))
            );
            // Replace-all: drop the plan's existing blocks. Scoped by subquery to this athlete's
            // plan as a second layer, but the real cross-tenant guard is the ownership pre-check
            // above (the block INSERTs below are scoped by plan_id only) — not a substitute for it.
            statements.push(
              db.delete(planBlock).where(
                inArray(
                  planBlock.planId,
                  db
                    .select({ id: trainingPlan.id })
                    .from(trainingPlan)
                    .where(and(eq(trainingPlan.id, planId), eq(trainingPlan.athleteId, athleteId)))
                )
              )
            );
          } else {
            statements.push(
              db.insert(trainingPlan).values({
                id: planId,
                athleteId,
                name: input.name,
                startDate: input.startDate,
                endDate: input.endDate,
                status: input.status ?? "draft",
                goalId: input.goalId ?? null,
                rationale: input.rationale ?? null,
                createdBy: input.createdBy ?? "ai"
              })
            );
          }

          input.blocks.forEach((block, index) => {
            statements.push(
              db.insert(planBlock).values({
                planId,
                name: block.name ?? null,
                phaseType: block.phaseType ?? null,
                startDate: block.startDate,
                endDate: block.endDate,
                focus: block.focus ?? null,
                orderIndex: index,
                weeklyTargets: block.weeklyTargets ?? null
              })
            );
          });

          await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

          const savedRows = await db
            .select()
            .from(trainingPlan)
            .where(eq(trainingPlan.id, planId))
            .limit(1);
          const savedPlan = savedRows[0];
          if (!savedPlan) {
            // The batch just committed an insert/update for planId, so the row must exist. A miss
            // is an internal invariant violation, not a "not owned" case — throw rather than
            // return null (null is reserved for the ownership pre-check, which the tool maps to
            // not-found), so a create can never silently resolve to a null "success".
            throw new Error("saveTrainingPlan: plan not found after write.");
          }
          const savedBlocks = await db
            .select()
            .from(planBlock)
            .where(eq(planBlock.planId, planId))
            .orderBy(asc(planBlock.orderIndex));
          return toTrainingPlan(savedPlan, savedBlocks);
        }
      };
    }
  };
}

export type AthleteDataRepository = ReturnType<typeof createAthleteDataRepository>;
export type ScopedAthleteDataRepository = ReturnType<AthleteDataRepository["forAthlete"]>;
