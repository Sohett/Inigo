import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import type { CoachingTargets, FtpStatus } from "./types";

/**
 * Semi-stable athlete profile (1:1 with `athlete`): the coaching context Intervals.icu does
 * not hold. Physiology (sex, birth date, height, weight, resting/max HR) lives on
 * Intervals.icu only and is never copied here (INI-62). Thresholds are historised in
 * `athlete_threshold`. Objectives and schedule constraints get their own structured tables
 * (`goal`, `athlete_constraint`).
 */
export const athleteProfile = pgTable(
  "athlete_profile",
  {
    athleteId: uuid("athlete_id")
      .primaryKey()
      .references(() => athlete.id, { onDelete: "cascade" }),
    /** Target weight, a coaching goal Intervals.icu does not hold (the weight itself lives there). */
    weightTargetKg: numeric("weight_target_kg", { precision: 5, scale: 2 }),
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
    /** Programmes, apps or coaches already tried, and what worked or not (INI-62). */
    pastCoaching: text("past_coaching"),
    /** What the athlete expects from Inigo, in their words (INI-62). */
    coachExpectations: text("coach_expectations"),
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
    check(
      "athlete_profile_ftp_status_check",
      sql`${t.ftpStatus} is null or ${t.ftpStatus} in ('confirmed', 'to_test', 'heart_rate_only')`
    )
  ]
);
