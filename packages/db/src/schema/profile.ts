import { sql } from "drizzle-orm";
import {
  boolean,
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
import type { CoachingTargets, FtpStatus, Sex } from "./types";

/**
 * Semi-stable athlete profile (1:1 with `athlete`). Physiology reference values plus
 * narrative coaching context. Current weight lives here as a reference; the weight
 * *series* and daily wellness stay on Intervals.icu. Thresholds are historised in
 * `athlete_threshold`, not frozen here. Objectives and schedule constraints get their own
 * structured tables (`goal`, `athlete_constraint`).
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
    /** Usual weekly training volume available, in hours. */
    weeklyHours: numeric("weekly_hours", { precision: 4, scale: 1 }),
    /** Equipment at hand (home trainer, power meter, gym…). */
    equipment: text("equipment").array(),
    /** Narrative constraints the agent reads as prose. Structured slots live in `athlete_constraint`. */
    constraintsNotes: text("constraints_notes"),
    /** Active limitations + hard rules (markdown) the gate and agent must respect. */
    healthNotes: text("health_notes"),
    /** Coaching config (peak event, CTL peak target, ramp max, TSB window). */
    coachingTargets: jsonb("coaching_targets").$type<CoachingTargets>(),
    /** Why the athlete came to Inigo, in their words (onboarding, INI-42). */
    motivation: text("motivation"),
    /** Sporting background and current training volume, as told at onboarding. */
    trainingBackground: text("training_background"),
    /** How the bike FTP was settled at onboarding; the value itself lives on Intervals.icu. */
    ftpStatus: text("ftp_status").$type<FtpStatus>(),
    /** The athlete was walked through Intervals.icu and Inigo's way of coaching. */
    educationDone: boolean("education_done").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  (t) => [
    check("athlete_profile_sex_check", sql`${t.sex} is null or ${t.sex} in ('M', 'F', 'other')`),
    check(
      "athlete_profile_ftp_status_check",
      sql`${t.ftpStatus} is null or ${t.ftpStatus} in ('confirmed', 'to_test', 'heart_rate_only')`
    )
  ]
);
