import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import { timestamps } from "./columns";
import { goal } from "./goal";
import type { PhaseType, PlanAuthor, PlanStatus, WeeklyTarget } from "./types";

/**
 * The macro-plan / season plan: an envelope tying a period to a primary goal.
 * Coaching output, not something Intervals.icu models as a first-class object.
 */
export const trainingPlan = pgTable(
  "training_plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athlete.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").references(() => goal.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status").$type<PlanStatus>().notNull().default("draft"),
    createdBy: text("created_by").$type<PlanAuthor>(),
    ...timestamps()
  },
  (t) => [
    index("training_plan_athlete_idx").on(t.athleteId),
    check(
      "training_plan_status_check",
      sql`${t.status} in ('draft', 'active', 'completed', 'archived')`
    ),
    check(
      "training_plan_created_by_check",
      sql`${t.createdBy} is null or ${t.createdBy} in ('ai', 'coach', 'system')`
    ),
    check("training_plan_dates_check", sql`${t.endDate} >= ${t.startDate}`)
  ]
);

/**
 * A mesocycle / phase of the plan. Integrates the weekly targets (the former
 * `plan_week`) as a `weekly_targets` JSONB ramp — a block spans several weeks. The
 * concrete, gate-validated week lives in `weekly_proposition`.
 */
export const planBlock = pgTable(
  "plan_block",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => trainingPlan.id, { onDelete: "cascade" }),
    name: text("name"),
    phaseType: text("phase_type").$type<PhaseType>(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    focus: text("focus"),
    orderIndex: integer("order_index").notNull(),
    weeklyTargets: jsonb("weekly_targets").$type<WeeklyTarget[]>()
  },
  (t) => [
    index("plan_block_plan_idx").on(t.planId),
    check(
      "plan_block_phase_type_check",
      sql`${t.phaseType} is null or ${t.phaseType} in ('base', 'build', 'peak', 'taper', 'transition')`
    ),
    check("plan_block_dates_check", sql`${t.endDate} >= ${t.startDate}`)
  ]
);
