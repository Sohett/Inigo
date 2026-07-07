import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import { planBlock, trainingPlan } from "./plan";
import type { PropositionStatus, ValidatorResult, WeeklyPropositionPayload } from "./types";

/**
 * A concrete week going through the gate: proposed → validated → applied (or rejected).
 * The proposed sessions live in `payload` until pushed to the Intervals.icu calendar,
 * after which `intervalsEventIds` records what was created (the calendar stays the
 * source of truth). Several rows can share (athlete, week_start): the re-adaptation
 * history. The current week = the latest `applied` row for that `week_start`.
 */
export const weeklyProposition = pgTable(
  "weekly_proposition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athlete.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => trainingPlan.id, { onDelete: "set null" }),
    blockId: uuid("block_id").references(() => planBlock.id, { onDelete: "set null" }),
    weekStart: date("week_start").notNull(),
    status: text("status").$type<PropositionStatus>().notNull().default("draft"),
    payload: jsonb("payload").$type<WeeklyPropositionPayload>(),
    validatorResult: jsonb("validator_result").$type<ValidatorResult>(),
    rationale: text("rationale"),
    intervalsEventIds: jsonb("intervals_event_ids").$type<string[]>(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
  },
  (t) => [
    index("weekly_proposition_athlete_week_idx").on(t.athleteId, t.weekStart),
    check(
      "weekly_proposition_status_check",
      sql`${t.status} in ('draft', 'validated', 'applied', 'rejected')`
    )
  ]
);
