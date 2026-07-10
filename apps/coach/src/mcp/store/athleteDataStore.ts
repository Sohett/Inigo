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
import type {
  AdaptationTrigger,
  AthleteConstraints,
  CoachingTargets,
  GoalPriority,
  GoalStatus,
  GoalType,
  PhaseType,
  PlanAuthor,
  PlanStatus,
  Sport,
  WeeklyTarget
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

/** A block of a training plan on write. `orderIndex` is derived from the array position. */
export interface PlanBlockInput {
  name?: string;
  phaseType?: PhaseType;
  startDate: string;
  endDate: string;
  focus?: string;
  weeklyTargets?: WeeklyTarget[];
}

/**
 * A training-plan write: create (no `id`) or update (`id` present). On write the plan is
 * scoped to the athlete; `blocks` fully replaces the plan's existing blocks (replace-all).
 */
export interface TrainingPlanInput {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: PlanStatus;
  goalId?: string | null;
  rationale?: string;
  createdBy?: PlanAuthor;
  blocks: PlanBlockInput[];
}

/**
 * Neon's HTTP driver parses `date` columns into local-time `Date` objects even though
 * Drizzle types them as `string`. Normalise both shapes back to a plain `YYYY-MM-DD`
 * with local getters — never `toISOString`, which would re-apply the timezone offset and
 * shift the day.
 */
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

type PlanRow = typeof trainingPlan.$inferSelect;
type BlockRow = typeof planBlock.$inferSelect;

/** Shape a plan + its ordered blocks for a tool response, normalising the date columns. */
function shapeTrainingPlan(plan: PlanRow, blocks: BlockRow[]) {
  return {
    plan: { ...plan, startDate: toDateString(plan.startDate), endDate: toDateString(plan.endDate) },
    blocks: blocks.map((block) => ({
      ...block,
      startDate: toDateString(block.startDate),
      endDate: toDateString(block.endDate)
    }))
  };
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
          return shapeTrainingPlan(plan, blocks);
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
        async saveTrainingPlan(input: TrainingPlanInput) {
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
          return shapeTrainingPlan(savedPlan, savedBlocks);
        }
      };
    }
  };
}

export type AthleteDataStore = ReturnType<typeof createAthleteDataStore>;
export type ScopedAthleteDataStore = ReturnType<AthleteDataStore["forAthlete"]>;
