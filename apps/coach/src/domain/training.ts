/**
 * Coach-owned business models of the training data that lives on Intervals.icu.
 *
 * Symmetric to `domain/coaching.ts`, which plays this role for the data we own in Neon: this
 * file is the **output contract of the Intervals MCP tools**. Until now those tools returned
 * the raw API object, which is how a single activity reached an agent with its 174 fields.
 *
 * The field lists below are the **single source of truth**. The same constant feeds the
 * `fields` query parameter we send to Intervals and the projection applied on the way out, so
 * the two can never drift: asking for a field we then drop, or dropping a field we still ask
 * for, is not expressible.
 */

/**
 * The activity fields a coach actually reasons about, out of the 174 Intervals returns.
 *
 * Chosen by crossing three sources: what the five agent prompts name, what our zod schemas
 * already validate, and what carries an explicit coaching concept. The classification of all
 * 174 is on INI-39, verified by script so nothing is dropped by inattention.
 */
export const COACHED_ACTIVITY_FIELDS = [
  // Identity and context
  "id",
  "name",
  "type",
  "sub_type",
  "start_date_local",
  "description",
  "trainer",
  "race",
  "commute",
  // Volume
  "moving_time",
  "elapsed_time",
  "distance",
  "total_elevation_gain",
  // Load and intensity
  "icu_training_load",
  "icu_intensity",
  "icu_ftp",
  "icu_weight",
  // Power and heart rate
  "icu_average_watts",
  "icu_weighted_avg_watts",
  "average_heartrate",
  "max_heartrate",
  "average_cadence",
  "average_speed",
  "pace",
  // Physiological reading
  "icu_efficiency_factor",
  "decoupling",
  "icu_variability_index",
  "polarization_index",
  // Intensity distribution
  "icu_zone_times",
  "icu_hr_zone_times",
  // Environment: heat explains a high heart rate, and the analyst's prompt names it
  "average_temp",
  "max_temp",
  // Compliance against the planned session, the analyst's first job
  "compliance",
  "paired_event_id",
  "interval_summary",
  // Felt effort
  "icu_rpe",
  "feel",
  "perceived_exertion",
  // In-ride fuelling: a coaching decision on long formats, distinct from diet
  "carbs_ingested",
  "carbs_used",
  // eFTP detection, which the analyst is the sole writer of
  "icu_rolling_ftp",
  "icu_rolling_ftp_delta"
] as const;

export type CoachedActivityField = (typeof COACHED_ACTIVITY_FIELDS)[number];

/** An activity as the coach sees it: the fields above, minus the ones Intervals left empty. */
export type CoachedActivity = { id: string | number } & Partial<
  Record<Exclude<CoachedActivityField, "id">, unknown>
>;

/**
 * The wellness fields a coach reasons about, out of the 46 Intervals returns.
 *
 * Daily nutrition, medical measurements and body composition are deliberately absent: they are
 * outside what this coach advises on, and the coordinator's prompt sends health questions to a
 * doctor. In-ride fuelling lives on the activity, not here.
 */
export const WELLNESS_DAY_FIELDS = [
  // Load and form
  "id", // the date
  "ctl",
  "atl",
  "rampRate",
  // Recovery markers
  "restingHR",
  "hrv",
  "hrvSDNN",
  "avgSleepingHR",
  // Sleep
  "sleepSecs",
  "sleepScore",
  "sleepQuality",
  // Self-reported
  "soreness",
  "fatigue",
  "stress",
  "mood",
  "motivation",
  "readiness",
  // Health and context
  "weight",
  "vo2max",
  "injury",
  "comments",
  "menstrualPhase",
  "menstrualPhasePredicted"
] as const;

export type WellnessDayField = (typeof WELLNESS_DAY_FIELDS)[number];

/** One wellness day as the coach sees it. */
export type WellnessDay = Partial<Record<WellnessDayField, unknown>>;

/** The three fields `get_fitness` derives its series from. Nothing else is read. */
export const FITNESS_FIELDS = ["id", "ctl", "atl"] as const;

/** A single fitness data point derived from wellness records. */
export interface FitnessPoint {
  date: string;
  ctl: number | null;
  atl: number | null;
  form: number | null;
}

/**
 * One sensor series over the requested window, at full resolution.
 *
 * Never downsampled. The constructor programs 30/15 Rønnestad intervals (30 s at 106-115 % FTP,
 * 15 s at ~50 %) and the analyst checks they were executed: any bucket average coarser than a
 * few seconds erases exactly what there was to verify. The volume is bounded by the window the
 * caller asks for, not by throwing resolution away.
 */
export interface StreamSeries {
  type: string;
  /** One value per second of the window, aligned with every other series in the window. */
  data: unknown[];
}

/** The slice of an activity's streams a caller asked for. */
export interface StreamWindow {
  activityId: string;
  /** Inclusive start offset in seconds from the activity start. */
  startSeconds: number;
  /** Exclusive end offset in seconds. */
  endSeconds: number;
  series: StreamSeries[];
}

/** One best-effort curve: the durations and the values held over them. */
export interface CurveSeries {
  /** Intervals' own label for the period, e.g. "Last 1y". */
  label: string | null;
  startDateLocal: string | null;
  endDateLocal: string | null;
  days: number | null;
  /** Effort durations in seconds, or distances in metres for a pace curve. */
  secs: number[];
  /** The value held over each corresponding duration. */
  values: number[];
  /** Power curves only: the same values per kilogram. */
  wattsPerKg?: number[];
}

/**
 * The event fields a coach reasons about, out of the 60 Intervals returns.
 *
 * Split between the listing and the single read on purpose. `workout_doc` carries the whole
 * step-by-step structure of a session: useful when the athlete asks what a session is, wasteful
 * seven times over when the question is what the week looks like. The listing answers "what is
 * planned", `get_event` answers "what exactly is this session".
 */
export const EVENT_SUMMARY_FIELDS = [
  // Identity and placement in the calendar
  "id",
  "start_date_local",
  "end_date_local",
  "category",
  "type",
  "sub_type",
  "name",
  "description",
  // The prescription: intended load and targets
  "icu_training_load",
  "icu_intensity",
  "moving_time",
  "distance",
  "load_target",
  "time_target",
  "distance_target",
  "target",
  // Execution context
  "indoor",
  "carbs_per_hour"
] as const;

/** The listing fields plus the full session structure. */
export const EVENT_DETAIL_FIELDS = [...EVENT_SUMMARY_FIELDS, "workout_doc"] as const;

export type EventField = (typeof EVENT_DETAIL_FIELDS)[number];

/** A calendar event as the coach sees it. */
export type CoachedEvent = { id: string | number } & Partial<
  Record<Exclude<EventField, "id">, unknown>
>;

/**
 * How much history a read returns when the caller names no bounds.
 *
 * These are coaching choices, not technical limits, so they are declared here rather than
 * invented in an adapter. A month of activities and of wellness is what a coach looks back on
 * to judge current form; beyond that the agent asks for a range explicitly.
 */
export const DEFAULT_READ_BOUNDS = {
  /** Activities returned when no `limit` is given, on top of the existing 30-day window. */
  activityLimit: 15,
  /** Days of wellness returned when no range is given. */
  wellnessDays: 30,
  /** Events returned when no `limit` is given. The API already defaults to a 7-day window. */
  eventLimit: 30
} as const;
