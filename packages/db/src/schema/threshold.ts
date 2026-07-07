import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import type { Sport, ThresholdSource, Zone } from "./types";

/**
 * Historised training thresholds — one row per change (principle: never freeze FTP
 * on the profile). Current values = the latest row per (athlete, sport). This is the
 * coaching reference and its history; Intervals.icu sport-settings holds the value
 * used to *compute* activity metrics, and is kept in sync when the coach changes it.
 */
export const athleteThreshold = pgTable(
  "athlete_threshold",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athlete.id, { onDelete: "cascade" }),
    sport: text("sport").$type<Sport>().notNull().default("bike"),
    ftpWatts: integer("ftp_watts"),
    thresholdHr: integer("threshold_hr"),
    maxHr: integer("max_hr"),
    thresholdPaceSPerKm: integer("threshold_pace_s_per_km"),
    powerZones: jsonb("power_zones").$type<Zone[]>(),
    hrZones: jsonb("hr_zones").$type<Zone[]>(),
    source: text("source").$type<ThresholdSource>(),
    effectiveDate: date("effective_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    unique("athlete_threshold_effective_unique").on(t.athleteId, t.sport, t.effectiveDate),
    index("athlete_threshold_athlete_idx").on(t.athleteId),
    check("athlete_threshold_sport_check", sql`${t.sport} in ('bike', 'run', 'swim')`),
    check(
      "athlete_threshold_source_check",
      sql`${t.source} is null or ${t.source} in ('test', 'estimated', 'manual')`
    )
  ]
);
