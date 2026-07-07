import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import { timestamps } from "./columns";
import type { GoalPriority, GoalStatus, GoalType } from "./types";

/**
 * Structured objectives (season targets, races, performance/health goals). A race can
 * also exist as an Intervals.icu RACE_A/B/C event — `intervalsEventId` links the two
 * without duplicating the calendar entry.
 */
export const goal = pgTable(
  "goal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athlete.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").$type<GoalType>(),
    targetDate: date("target_date"),
    priority: text("priority").$type<GoalPriority>(),
    status: text("status").$type<GoalStatus>().notNull().default("active"),
    /** Optional link to the matching Intervals.icu event. */
    intervalsEventId: text("intervals_event_id"),
    ...timestamps()
  },
  (t) => [
    index("goal_athlete_idx").on(t.athleteId),
    check("goal_type_check", sql`${t.type} is null or ${t.type} in ('event', 'performance', 'health')`),
    check("goal_priority_check", sql`${t.priority} is null or ${t.priority} in ('A', 'B', 'C')`),
    check("goal_status_check", sql`${t.status} in ('active', 'achieved', 'abandoned')`)
  ]
);
