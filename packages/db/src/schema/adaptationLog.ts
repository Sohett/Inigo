import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import { trainingPlan } from "./plan";
import { weeklyProposition } from "./proposition";
import type { AdaptationTrigger } from "./types";

/**
 * Append-only coaching journal: one row per decision, with its trigger and why.
 * Replaces the unbounded `adaptation-log.md` (one row per entry keeps it from
 * growing into a single oversized document). Rows are inserted, never updated.
 */
export const adaptationLog = pgTable(
  "adaptation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athlete.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => trainingPlan.id, { onDelete: "set null" }),
    /** The week/proposition this entry acted on, if any. */
    propositionId: uuid("proposition_id").references(() => weeklyProposition.id, {
      onDelete: "set null"
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** Agent name (analyste/architecte/…) or "thomas". */
    author: text("author"),
    trigger: text("trigger").$type<AdaptationTrigger>(),
    summary: text("summary").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    relatedWeek: date("related_week"),
    intervalsEventIds: jsonb("intervals_event_ids").$type<string[]>()
  },
  (t) => [
    index("adaptation_log_athlete_idx").on(t.athleteId),
    check(
      "adaptation_log_trigger_check",
      sql`${t.trigger} is null or ${t.trigger} in ('missed_session', 'low_readiness', 'illness', 'manual', 'scheduled')`
    )
  ]
);
