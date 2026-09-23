/**
 * Projections from the raw Intervals.icu objects onto the coach's models.
 *
 * Pure transformation, no decision: which fields matter is declared once in `domain/training.ts`
 * and applied here. Any rule about *how much* to ask for (a window, a cap, a default range)
 * belongs to a use-case, not to this file.
 */
import {
  COACHED_ACTIVITY_FIELDS,
  EVENT_SUMMARY_FIELDS,
  WELLNESS_DAY_FIELDS,
  type CoachedActivity,
  type CoachedEvent,
  type CurveSeries,
  type EventField,
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

/** One activity, reduced to the fields a coach reasons about. */
export function toCoachedActivity(raw: Record<string, unknown>): CoachedActivity {
  const projected = pick(raw, COACHED_ACTIVITY_FIELDS);
  // `id` is the one field Intervals always returns and the one a follow-up call needs.
  return { ...projected, id: raw["id"] as string | number };
}

export function toCoachedActivities(raw: Record<string, unknown>[]): CoachedActivity[] {
  return raw.map(toCoachedActivity);
}

/** One wellness day, reduced to the fields a coach reasons about. */
export function toWellnessDay(raw: Record<string, unknown>): WellnessDay {
  return pick(raw, WELLNESS_DAY_FIELDS);
}

export function toWellnessDays(raw: Record<string, unknown>[]): WellnessDay[] {
  return raw.map(toWellnessDay);
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * One curve, reduced to the durations and the values held over them.
 *
 * Everything else goes: `submax_*` are 2D matrices, `powerModels`, `ranks` and `mapPlot` are
 * Intervals' own analysis, and `start_index` / `end_index` / `activity_id` point into data the
 * agent does not have.
 */
export function toCurveSeries(raw: Record<string, unknown>): CurveSeries {
  const wattsPerKg = numbers(raw["watts_per_kg"]);
  return {
    label: nullableString(raw["label"]),
    startDateLocal: nullableString(raw["start_date_local"]),
    endDateLocal: nullableString(raw["end_date_local"]),
    days: nullableNumber(raw["days"]),
    // A pace curve carries `distance` where the others carry `secs`.
    secs: numbers(raw["secs"]).length > 0 ? numbers(raw["secs"]) : numbers(raw["distance"]),
    values: numbers(raw["values"]),
    ...(wattsPerKg.length > 0 ? { wattsPerKg } : {})
  };
}

/**
 * A curve response, reduced to its series.
 *
 * The API answers `{ list, activities }` where `activities` is a **map of complete Activity
 * objects**, 174 fields each, one per activity that contributed a best effort. A curve over a
 * year references dozens of them. There is no query parameter to exclude it, so it is dropped
 * here, and it is the single biggest saving of this whole projection.
 */
export function toCurveSeriesList(raw: unknown): CurveSeries[] {
  if (raw === null || typeof raw !== "object") return [];
  const list = (raw as { list?: unknown }).list;
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object")
    .map(toCurveSeries);
}

/** One event, reduced to the fields a coach reasons about. `fields` picks listing or detail. */
export function toCoachedEvent(
  raw: Record<string, unknown>,
  fields: readonly EventField[]
): CoachedEvent {
  const projected = pick(raw, fields);
  return { ...projected, id: raw["id"] as string | number };
}

/** The week's calendar: no `workout_doc`, which `get_event` serves for one session. */
export function toCoachedEvents(raw: Record<string, unknown>[]): CoachedEvent[] {
  return raw.map((event) => toCoachedEvent(event, EVENT_SUMMARY_FIELDS));
}
