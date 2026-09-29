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
  // `pace` is not kept: measured against `average_speed` on real rides it differs by at most
  // 0.08 %, so it is the same quantity twice. Recoverable through the `fields` parameter.
  "average_speed",
  // Physiological reading
  "icu_efficiency_factor",
  "decoupling",
  "icu_variability_index",
  "polarization_index",
  // Intensity distribution. `icu_zone_times` is republished as a `{ zone: seconds }` map; the
  // heart-rate one already arrives from the API as a bare array of seconds per zone.
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

/**
 * How many decimals a projected number keeps.
 *
 * Intervals answers in full float precision, so a form of minus five arrives as
 * `-5.005309999999994`: eighteen characters for a number a coach reads to a tenth. Two decimals
 * is past the point where any coaching call changes, and still leaves room for the ratios
 * (efficiency factor, variability index) where one decimal would round away a real difference.
 * Measured on a 46-day fitness series, rounding alone removes 28 % of the payload.
 */
export const PROJECTED_DECIMALS = 2;

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
  /** One value per sample of the window, aligned with every other series in the window. */
  data: unknown[];
}

/**
 * The slice of an activity's streams a caller asked for.
 *
 * Bounds are **sample indices**, not seconds. Intervals.icu publishes no time base on a stream,
 * and auto-pause, smart recording and imported files all break the one-sample-per-second
 * assumption. Naming them indices is also what matches the workflow: an agent finds an effort
 * with `get_activity_intervals`, whose intervals carry `start_index` and `end_index`.
 */
export interface StreamWindow {
  activityId: string;
  /** Inclusive start, as a sample index. */
  startIndex: number;
  /**
   * Exclusive end, as a sample index. **The end actually returned**, which is smaller than the
   * one requested when the window ran past the end of the recording. Never assume it matches
   * what was asked for.
   */
  endIndex: number;
  series: StreamSeries[];
  /**
   * Series that were asked for and came back absent or empty, named rather than dropped: an
   * agent can only re-plan if it knows which sensor it is missing.
   */
  missingTypes?: string[];
}

/**
 * What a curve's x axis measures.
 *
 * Not inferable from the payload: `DataCurve` declares both `secs` and `distance`, and only the
 * endpoint that was called says which one is populated. Power and heart rate are indexed by
 * effort duration, pace by distance.
 */
export type CurveAxis = "secs" | "distance";

/** The part of a curve that does not depend on its axis. */
interface CurveSeriesBase {
  /** Intervals' own label for the period, e.g. "Last 1y". */
  label: string | null;
  startDateLocal: string | null;
  endDateLocal: string | null;
  days: number | null;
  /**
   * The best value held over each corresponding x. Positional: `values[i]` pairs with the x at
   * index `i`, so a missing entry is `null` rather than removed.
   */
  values: (number | null)[];
  /** Power curves only: the same values per kilogram. */
  wattsPerKg?: (number | null)[];
}

/**
 * One best-effort curve: the x axis and the values held over it.
 *
 * The axis is carried by the **key name**, so the payload says what it means without a second
 * field: a pace curve's metres never arrive under `secs`, where an agent would read them as
 * seconds and conclude the athlete held that pace for a quarter of an hour.
 */
export type CurveSeries =
  | (CurveSeriesBase & { secs: (number | null)[] })
  | (CurveSeriesBase & { distance: (number | null)[] });

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
  eventLimit: 30,
  /** Days of activities returned when no range is given. */
  activityDays: 30,
  /**
   * Days of fitness returned when no range is given. Longer than the other windows because the
   * point of the series is the trend: a CTL ramp over three months is what says whether the
   * build is working, where thirty days only shows the current block.
   */
  fitnessDays: 90
} as const;

/**
 * The interval fields a coach reasons about, out of the 75 Intervals returns.
 *
 * This is where a structured session is judged against its plan: a 30/15 block comes back as
 * thirty-odd intervals, so 75 fields each is the largest single read left on this server once
 * the streams are bounded. Laboratory sensors (SmO2, THb, DFA a1, lactate), weather, the W'bal
 * model and Intervals' own percentiles all go; what stays is what a coach reads off a rep.
 */
export const COACHED_INTERVAL_FIELDS = [
  // Placement in the session
  "id",
  "type",
  "group_id",
  "label",
  "start_index",
  "end_index",
  "start_time",
  "end_time",
  "elapsed_time",
  "moving_time",
  "distance",
  // Power
  "average_watts",
  "weighted_average_watts",
  "max_watts",
  "average_watts_kg",
  "intensity",
  "zone",
  // Heart rate, cadence, pace
  "average_heartrate",
  "max_heartrate",
  "average_cadence",
  "average_speed",
  "gap",
  // Physiological reading
  "decoupling",
  "w5s_variability",
  "training_load",
  // Context
  "total_elevation_gain",
  "average_gradient",
  "average_temp"
] as const;

export type CoachedIntervalField = (typeof COACHED_INTERVAL_FIELDS)[number];

/** One interval as the coach reads it. */
export type CoachedInterval = Partial<Record<CoachedIntervalField, unknown>>;

/** What only describes a single repetition, so a group aggregate never carries it. */
const INTERVAL_ONLY_FIELDS = [
  "type",
  "group_id",
  "label",
  "end_index",
  "start_time",
  "end_time"
] as const satisfies readonly CoachedIntervalField[];

/** The per-interval fields that also make sense once summed over a group. */
type SharedIntervalField = Exclude<CoachedIntervalField, (typeof INTERVAL_ONLY_FIELDS)[number]>;

export type CoachedIntervalGroupField = SharedIntervalField | "count";

/**
 * The aggregate over a group of repeated intervals, derived from the per-interval list.
 *
 * `icu_groups` is what answers "was the 8x3min held", in one object instead of eight, so it is
 * the cheaper read of the two and must not be dropped. Deriving it from the interval list keeps
 * one source of truth: a field added for a repetition is available on the group that sums them.
 * `count` is the one addition, and it is the whole point of a group.
 */
export const COACHED_INTERVAL_GROUP_FIELDS: readonly CoachedIntervalGroupField[] = [
  ...COACHED_INTERVAL_FIELDS.filter(
    (field): field is SharedIntervalField =>
      !(INTERVAL_ONLY_FIELDS as readonly string[]).includes(field)
  ),
  "count"
];

/** One group of repeated intervals as the coach reads it. */
export type CoachedIntervalGroup = Partial<Record<CoachedIntervalGroupField, unknown>>;

/**
 * The interval breakdown of one session: each repetition, and the aggregate per group.
 *
 * Both are kept because they answer different questions. The groups say whether a block was
 * held overall, the intervals say which repetition faded.
 */
export interface CoachedActivityIntervals {
  intervals: CoachedInterval[];
  groups: CoachedIntervalGroup[];
}
