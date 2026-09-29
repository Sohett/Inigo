/**
 * Projections from the raw Intervals.icu objects onto the coach's models.
 *
 * Pure transformation, no decision: which fields matter is declared once in `domain/training.ts`
 * and applied here. Any rule about *how much* to ask for (a window, a cap, a default range)
 * belongs to a use-case, not to this file.
 */
import {
  COACHED_ACTIVITY_FIELDS,
  COACHED_INTERVAL_FIELDS,
  COACHED_INTERVAL_GROUP_FIELDS,
  EVENT_SUMMARY_FIELDS,
  WELLNESS_DAY_FIELDS,
  type CoachedActivity,
  type CoachedActivityField,
  type CoachedActivityIntervals,
  type CoachedEvent,
  type CurveAxis,
  type CurveSeries,
  type EventField,
  type FitnessPoint,
  type WellnessDay
} from "../../domain/training";

/**
 * Keep only `fields`, and drop keys Intervals left null or absent.
 *
 * Dropping empties is not cosmetic: `"average_temp": null` costs tokens on every activity of
 * every listing, and says nothing a missing key does not.
 */
function pick<T extends string>(
  source: Record<string, unknown>,
  fields: readonly T[]
): Partial<Record<T, unknown>> {
  const projected: Partial<Record<T, unknown>> = {};
  for (const field of fields) {
    const value = source[field];
    if (value !== undefined && value !== null) projected[field] = value;
  }
  return projected;
}

/**
 * One activity, reduced to the fields asked for.
 *
 * The list is a parameter, not a constant, so that a caller naming its own `fields` gets them
 * back. Projecting on the default set regardless would fetch a field over the wire and then
 * throw it away, which is the silent loss this whole file exists to remove.
 */
export function toCoachedActivity(
  raw: Record<string, unknown>,
  fields: readonly string[] = COACHED_ACTIVITY_FIELDS
): CoachedActivity {
  const projected = pick(raw, fields) as Partial<Record<CoachedActivityField, unknown>>;
  const id = raw["id"];
  // Intervals omits `id` when the caller's `fields` did not name it; do not invent one.
  return id === undefined || id === null
    ? (projected as CoachedActivity)
    : { ...projected, id: id as string | number };
}

export function toCoachedActivities(
  raw: Record<string, unknown>[],
  fields: readonly string[] = COACHED_ACTIVITY_FIELDS
): CoachedActivity[] {
  return raw.map((activity) => toCoachedActivity(activity, fields));
}

/** Every readable object of a raw array, ignoring the rest rather than throwing on it. */
function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object"
      )
    : [];
}

/**
 * The interval breakdown of a session, reduced to what a coach reads off a repetition.
 *
 * Both halves are kept: `icu_groups` says whether the block was held overall, `icu_intervals`
 * says which repetition faded. Dropping either would answer only half of "was this session
 * executed as planned", which is the analyst's first job.
 */
export function toCoachedActivityIntervals(raw: unknown): CoachedActivityIntervals {
  const source = (raw ?? {}) as { icu_intervals?: unknown; icu_groups?: unknown };
  return {
    intervals: objects(source.icu_intervals).map((entry) => pick(entry, COACHED_INTERVAL_FIELDS)),
    groups: objects(source.icu_groups).map((entry) => pick(entry, COACHED_INTERVAL_GROUP_FIELDS))
  };
}

/**
 * The CTL/ATL/form series, derived from wellness records.
 *
 * Form is not a stored field: Intervals leaves `ctl - atl` to the caller, and computing it here
 * rather than in the agent's head is what makes the tool answer "how fresh am I" directly. Both
 * terms are needed, so a day missing either has no form rather than a wrong one.
 */
export function toFitnessPoints(raw: Record<string, unknown>[]): FitnessPoint[] {
  return raw.map((record) => {
    const ctl = nullableNumber(record["ctl"]);
    const atl = nullableNumber(record["atl"]);
    return {
      date: nullableString(record["id"]) ?? "",
      ctl,
      atl,
      form: ctl !== null && atl !== null ? ctl - atl : null
    };
  });
}

/** One wellness day, reduced to the fields a coach reasons about. */
export function toWellnessDay(raw: Record<string, unknown>): WellnessDay {
  return pick(raw, WELLNESS_DAY_FIELDS);
}

export function toWellnessDays(raw: Record<string, unknown>[]): WellnessDay[] {
  return raw.map(toWellnessDay);
}

/**
 * Read a positional array of numbers, keeping every slot.
 *
 * Never filtered: `secs[i]` pairs with `values[i]` pairs with `wattsPerKg[i]`. Dropping one
 * non-number would shift every later value onto the wrong duration, and the result would stay
 * well-formed and plausible while being wrong.
 */
function numbers(value: unknown): (number | null)[] {
  return Array.isArray(value) ? value.map((item) => (typeof item === "number" ? item : null)) : [];
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * One curve, reduced to its axis and the values held over it.
 *
 * Everything else goes: `submax_*` are 2D matrices, `powerModels`, `ranks` and `mapPlot` are
 * Intervals' own analysis, and `start_index` / `end_index` / `activity_id` point into data the
 * agent does not have.
 *
 * The axis is told by the caller, never guessed from whichever array happens to be populated:
 * `DataCurve` declares both `secs` and `distance`, and only the endpoint that was called knows
 * which one carries the x values.
 */
export function toCurveSeries(raw: Record<string, unknown>, axis: CurveAxis): CurveSeries {
  const wattsPerKg = numbers(raw["watts_per_kg"]);
  const base = {
    label: nullableString(raw["label"]),
    startDateLocal: nullableString(raw["start_date_local"]),
    endDateLocal: nullableString(raw["end_date_local"]),
    days: nullableNumber(raw["days"]),
    values: numbers(raw["values"]),
    ...(wattsPerKg.length > 0 ? { wattsPerKg } : {})
  };
  const x = numbers(raw[axis]);
  return axis === "secs" ? { ...base, secs: x } : { ...base, distance: x };
}

/**
 * A curve response, reduced to its series.
 *
 * The API answers `{ list, activities }` where `activities` is a **map of complete Activity
 * objects**, 174 fields each, one per activity that contributed a best effort. A curve over a
 * year references dozens of them. There is no query parameter to exclude it, so it is dropped
 * here, and it is the single biggest saving of this whole projection.
 */
export function toCurveSeriesList(raw: unknown, axis: CurveAxis): CurveSeries[] {
  if (raw === null || typeof raw !== "object") return [];
  return objects((raw as { list?: unknown }).list).map((entry) => toCurveSeries(entry, axis));
}

/**
 * One event, reduced to the fields a coach reasons about. `fields` picks listing or detail.
 *
 * `id` is re-added when Intervals sent one, since every field list names it and a follow-up
 * call needs it, but never invented: `"id": null` would be an identifier that resolves to
 * nothing, which is the same choice made for an activity.
 */
export function toCoachedEvent(
  raw: Record<string, unknown>,
  fields: readonly EventField[]
): CoachedEvent {
  const projected = pick(raw, fields);
  const id = raw["id"];
  return id === undefined || id === null
    ? (projected as CoachedEvent)
    : { ...projected, id: id as string | number };
}

/** The week's calendar: no `workout_doc`, which `get_event` serves for one session. */
export function toCoachedEvents(raw: Record<string, unknown>[]): CoachedEvent[] {
  return raw.map((event) => toCoachedEvent(event, EVENT_SUMMARY_FIELDS));
}
