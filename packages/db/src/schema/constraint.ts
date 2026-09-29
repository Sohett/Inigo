import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, smallint, text, time, uuid } from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import { timestamps } from "./columns";
import type { ConstraintActivity, ConstraintKind } from "./types";

/**
 * Schedule constraints, one row per rule, recurring OR dated:
 * - recurring: `weekday` (ISO, 1 = Monday … 7 = Sunday), e.g. "strength with coach every Tuesday";
 * - dated: `start_date`..`end_date` inclusive, e.g. "travelling 12–14 Oct".
 *
 * `kind` says what the rule means for planning: `fixed_session` (a session that must happen
 * on that slot, `activity` says which), `unavailable` (no session at all), `limited`
 * (reduced availability or conditions, spelled out in `note`). The agents read the active
 * rows through `get_profile`; the validator gate checks `fixed_session` / `unavailable`.
 */
export const athleteConstraint = pgTable(
  "athlete_constraint",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athlete.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ConstraintKind>().notNull(),
    weekday: smallint("weekday"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    activity: text("activity").$type<ConstraintActivity>(),
    startTime: time("start_time"),
    durationMin: integer("duration_min"),
    note: text("note"),
    ...timestamps()
  },
  (t) => [
    index("athlete_constraint_athlete_idx").on(t.athleteId),
    check(
      "athlete_constraint_kind_check",
      sql`${t.kind} in ('fixed_session', 'unavailable', 'limited')`
    ),
    check(
      "athlete_constraint_activity_check",
      sql`${t.activity} is null or ${t.activity} in ('strength', 'bike', 'run', 'swim')`
    ),
    check(
      "athlete_constraint_when_check",
      // Every operand is null-safe (`is [not] null`) so the CHECK can't pass on a NULL.
      sql`(${t.weekday} is not null and ${t.weekday} between 1 and 7
          and ${t.startDate} is null and ${t.endDate} is null)
        or (${t.weekday} is null and ${t.startDate} is not null and ${t.endDate} is not null
          and ${t.endDate} >= ${t.startDate})`
    ),
    check(
      "athlete_constraint_fixed_session_activity_check",
      sql`${t.kind} <> 'fixed_session' or ${t.activity} is not null`
    ),
    check(
      "athlete_constraint_duration_check",
      sql`${t.durationMin} is null or ${t.durationMin} > 0`
    )
  ]
);
