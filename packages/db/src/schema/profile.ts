import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import type { AthleteConstraints, CoachingTargets, Sex } from "./types";

/**
 * Semi-stable athlete profile (1:1 with `athlete`). Physiology reference values plus
 * narrative coaching context. Current weight lives here as a reference; the weight
 * *series* and daily wellness stay on Intervals.icu. Thresholds are historised in
 * `athlete_threshold`, not frozen here. Objectives get their own structured table.
 */
export const athleteProfile = pgTable(
  "athlete_profile",
  {
    athleteId: uuid("athlete_id")
      .primaryKey()
      .references(() => athlete.id, { onDelete: "cascade" }),
    birthDate: date("birth_date"),
    sex: text("sex").$type<Sex>(),
    heightCm: numeric("height_cm", { precision: 5, scale: 2 }),
    /** Reference weight; the historical series lives in Intervals.icu wellness. */
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
    weightTargetKg: numeric("weight_target_kg", { precision: 5, scale: 2 }),
    restingHr: integer("resting_hr"),
    maxHr: integer("max_hr"),
    /** Machine-checkable availability (weekly hours, fixed slots, equipment). */
    constraints: jsonb("constraints").$type<AthleteConstraints>(),
    /** Narrative constraints the agent reads as prose. */
    constraintsNotes: text("constraints_notes"),
    /** Active limitations + hard rules (markdown) the gate and agent must respect. */
    healthNotes: text("health_notes"),
    /** Coaching config (peak event, CTL peak target, ramp max, TSB window). */
    coachingTargets: jsonb("coaching_targets").$type<CoachingTargets>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  (t) => [
    check("athlete_profile_sex_check", sql`${t.sex} is null or ${t.sex} in ('M', 'F', 'other')`)
  ]
);
