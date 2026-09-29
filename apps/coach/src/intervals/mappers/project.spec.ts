import { describe, it, expect } from "vitest";
import {
  COACHED_ACTIVITY_FIELDS,
  COACHED_INTERVAL_FIELDS,
  COACHED_INTERVAL_GROUP_FIELDS,
  EVENT_DETAIL_FIELDS,
  EVENT_SUMMARY_FIELDS,
  WELLNESS_DAY_FIELDS,
  type CoachedActivityField
} from "../../domain/training";
import {
  toCoachedActivities,
  toCoachedActivity,
  toCoachedActivityIntervals,
  toCoachedEvent,
  toCoachedEvents,
  toCurveSeriesList,
  toFitnessPoints,
  toWellnessDay
} from "./project";

describe("field lists", () => {
  it.each([
    ["activity", COACHED_ACTIVITY_FIELDS],
    ["wellness", WELLNESS_DAY_FIELDS],
    ["interval", COACHED_INTERVAL_FIELDS],
    ["interval group", COACHED_INTERVAL_GROUP_FIELDS],
    ["event", EVENT_DETAIL_FIELDS]
  ])("declares each %s field once", (_label, fields) => {
    expect(new Set(fields).size).toBe(fields.length);
  });

  // The group list is derived from the interval list so the two cannot drift: a field added for
  // a repetition is available on the group that sums them, without a second edit.
  it("derives the group fields from the interval fields, plus count", () => {
    const perRepetitionOnly = ["type", "group_id", "label", "end_index", "start_time", "end_time"];

    expect([...COACHED_INTERVAL_GROUP_FIELDS].sort()).toEqual(
      [...COACHED_INTERVAL_FIELDS.filter((f) => !perRepetitionOnly.includes(f)), "count"].sort()
    );
  });

  // The six fields the enumeration rescued. Each one carries a coaching capability that a
  // shorter list would have silently removed, so each is asserted by name.
  it.each([
    ["compliance", "the score against the planned session, the analyst's first job"],
    ["average_temp", "heat explains a high heart rate"],
    ["paired_event_id", "the link that makes planned versus done explicit"],
    ["icu_rolling_ftp", "the analyst is the sole writer of FTP and must detect a new eFTP"],
    ["polarization_index", "the constructor checks intensity distribution"],
    ["carbs_ingested", "in-ride fuelling is a coaching decision on long formats"]
  ])("keeps %s: %s", (field) => {
    expect(COACHED_ACTIVITY_FIELDS).toContain(field as CoachedActivityField);
  });
});

describe("toCoachedActivity", () => {
  it("keeps the declared fields and drops everything else", () => {
    const projected = toCoachedActivity({
      id: "i1",
      name: "Sortie longue",
      icu_training_load: 210,
      // None of these is in the list: weather, power model, sync plumbing.
      average_wind_speed: 12,
      icu_pm_cp: 280,
      skyline_chart_bytes: "…",
      strava_id: 42
    });

    expect(projected).toEqual({ id: "i1", name: "Sortie longue", icu_training_load: 210 });
  });

  // `"average_temp": null` costs tokens on every activity of every listing and says nothing a
  // missing key does not.
  it("drops fields Intervals left null or absent", () => {
    const projected = toCoachedActivity({ id: "i1", name: null, decoupling: undefined, feel: 3 });

    expect(projected).toEqual({ id: "i1", feel: 3 });
  });

  it("always carries the id, which a follow-up call needs", () => {
    expect(toCoachedActivity({ id: 1234 })).toEqual({ id: 1234 });
  });

  it("projects a list", () => {
    expect(toCoachedActivities([{ id: "a", strava_id: 1 }, { id: "b" }])).toEqual([
      { id: "a" },
      { id: "b" }
    ]);
  });

  /**
   * The escape hatch. Projecting on the default set regardless would fetch a named field over
   * the wire and then throw it away, so the caller would see `{}` and never know why.
   */
  it("projects on the fields it is given, not on the default set", () => {
    expect(toCoachedActivity({ id: "i1", hr_load: 88, name: "Sortie" }, ["hr_load"])).toEqual({
      id: "i1",
      hr_load: 88
    });
  });

  // Intervals omits `id` when the caller's `fields` did not name it. Inventing one would hand
  // back an identifier that resolves to nothing.
  it("omits the id when Intervals did not send one", () => {
    expect(toCoachedActivity({ hr_load: 88 }, ["hr_load"])).toEqual({ hr_load: 88 });
  });
});

describe("toCoachedActivityIntervals", () => {
  it("keeps both the repetitions and the group aggregates", () => {
    const projected = toCoachedActivityIntervals({
      id: "i1",
      icu_intervals: [
        { id: 0, type: "WORK", label: "1", average_watts: 300, start_index: 60, end_index: 90 },
        { id: 1, type: "RECOVERY", label: "1", average_watts: 150 }
      ],
      icu_groups: [{ id: "G1", count: 8, average_watts: 295 }],
      analyzed: "2026-09-21T10:00:00Z"
    });

    expect(projected).toEqual({
      intervals: [
        { id: 0, type: "WORK", label: "1", average_watts: 300, start_index: 60, end_index: 90 },
        { id: 1, type: "RECOVERY", label: "1", average_watts: 150 }
      ],
      groups: [{ id: "G1", count: 8, average_watts: 295 }]
    });
  });

  // Laboratory sensors, the W`bal model and Intervals own percentiles are not what a coach
  // reads off a repetition, and there are 47 of them per interval.
  it("drops the laboratory and modelling fields", () => {
    const projected = toCoachedActivityIntervals({
      icu_intervals: [
        {
          id: 0,
          average_watts: 300,
          average_dfa_a1: 0.7,
          average_smo2: 62,
          average_lactate: 3.2,
          wbal_start: 20_000,
          average_wind_speed: 12,
          segment_effort_ids: [1, 2]
        }
      ]
    });

    expect(projected.intervals).toEqual([{ id: 0, average_watts: 300 }]);
  });

  it("returns both halves empty for an unreadable payload rather than throwing", () => {
    expect(toCoachedActivityIntervals(null)).toEqual({ intervals: [], groups: [] });
    expect(toCoachedActivityIntervals({ icu_intervals: "nope" })).toEqual({
      intervals: [],
      groups: []
    });
  });
});

describe("toCoachedEvent", () => {
  const planned = {
    id: 42,
    start_date_local: "2026-09-24T00:00:00",
    name: "VO2 8x3",
    icu_training_load: 95,
    workout_doc: { steps: ["warmup", "8x3min"] },
    // Intervals plumbing: sync state, push errors, colours.
    uid: "x",
    push_errors: [],
    color: "#fff",
    athlete_id: "i1"
  };

  /**
   * A week is five to seven sessions. `workout_doc` carries the whole step-by-step structure of
   * each one: useful when the athlete asks what a session is, wasteful seven times over when the
   * question is what the week looks like.
   */
  it("leaves the session structure out of a listing", () => {
    const projected = toCoachedEvents([planned]);

    expect(projected).toEqual([
      {
        id: 42,
        start_date_local: "2026-09-24T00:00:00",
        name: "VO2 8x3",
        icu_training_load: 95
      }
    ]);
  });

  it("serves the session structure on a single read", () => {
    const projected = toCoachedEvent(planned, EVENT_DETAIL_FIELDS);

    expect(projected).toMatchObject({ id: 42, workout_doc: { steps: ["warmup", "8x3min"] } });
    expect(projected).not.toHaveProperty("push_errors");
  });

  it("always carries the id, which a follow-up call needs", () => {
    expect(toCoachedEvent({ id: 7 }, EVENT_SUMMARY_FIELDS)).toEqual({ id: 7 });
  });
});

describe("precision and shape", () => {
  /**
   * Values taken from a real session: Intervals answers in full float precision, so a form of
   * minus five arrives as eighteen characters. Rounding removed 28 % of a 46-day series.
   */
  it("trims float noise without changing what a coach reads", () => {
    const projected = toCoachedActivity({
      id: "i1",
      icu_intensity: 83.703705,
      average_cadence: 81.56105,
      icu_variability_index: 1.2486188,
      average_temp: 22.789558
    });

    expect(projected).toEqual({
      id: "i1",
      icu_intensity: 83.7,
      average_cadence: 81.56,
      icu_variability_index: 1.25,
      average_temp: 22.79
    });
  });

  // A duration in seconds or an id must never acquire a decimal point.
  it("leaves integers exactly as they are", () => {
    expect(toCoachedActivity({ id: 137800180, moving_time: 3480, icu_training_load: 64 })).toEqual({
      id: 137800180,
      moving_time: 3480,
      icu_training_load: 64
    });
  });

  // 191 characters for the same eight numbers that fit in 79, on every activity of every listing.
  it("republishes zone times as a map of zone to seconds", () => {
    const projected = toCoachedActivity({
      id: "i1",
      icu_zone_times: [
        { id: "Z1", secs: 4203 },
        { id: "Z2", secs: 1893 },
        { id: "SS", secs: 1788 }
      ],
      // Already a bare array of seconds from the API: nothing to flatten.
      icu_hr_zone_times: [120, 340, 80]
    });

    expect(projected).toEqual({
      id: "i1",
      icu_zone_times: { Z1: 4203, Z2: 1893, SS: 1788 },
      icu_hr_zone_times: [120, 340, 80]
    });
  });

  it("leaves an unreadable zone payload alone rather than emptying it", () => {
    expect(toCoachedActivity({ id: "i1", icu_zone_times: "n/a" })).toEqual({
      id: "i1",
      icu_zone_times: "n/a"
    });
  });

  /**
   * Measured against `average_speed` on seven real rides, `pace` differed by at most 0.08 %:
   * the same quantity carried twice on every activity of every listing.
   */
  it("drops pace, which duplicates average_speed", () => {
    expect(COACHED_ACTIVITY_FIELDS).not.toContain("pace" as CoachedActivityField);
    expect(toCoachedActivity({ id: "i1", average_speed: 7.771, pace: 7.7707496 })).toEqual({
      id: "i1",
      average_speed: 7.77
    });
  });
});

describe("toFitnessPoints", () => {
  // Form is not a stored field: Intervals leaves `ctl - atl` to the caller.
  it("derives form from ctl and atl", () => {
    const points = toFitnessPoints([
      { id: "2026-06-01", ctl: 50, atl: 40 },
      { id: "2026-06-02", ctl: 52 }
    ]);

    expect(points).toEqual([
      { date: "2026-06-01", ctl: 50, atl: 40, form: 10 },
      // Both terms are needed: a day missing one has no form rather than a wrong one.
      { date: "2026-06-02", ctl: 52, atl: null, form: null }
    ]);
  });

  // The subtraction of two floats is where the worst of the noise is born: these exact inputs
  // produced `-5.005309999999994` in a real session.
  it("rounds the subtraction rather than publishing its float noise", () => {
    const points = toFitnessPoints([{ id: "2026-08-15", ctl: 52.850323, atl: 57.855633 }]);

    expect(points).toEqual([{ date: "2026-08-15", ctl: 52.85, atl: 57.86, form: -5.01 }]);
  });
});

describe("toWellnessDay", () => {
  it("keeps the declared fields and drops medical and nutrition ones", () => {
    const projected = toWellnessDay({
      id: "2026-09-21",
      ctl: 72,
      hrv: 61,
      injury: "mollet",
      bloodGlucose: 5.4,
      kcalConsumed: 2800,
      systolic: 120
    });

    expect(projected).toEqual({ id: "2026-09-21", ctl: 72, hrv: 61, injury: "mollet" });
  });
});

describe("toCurveSeriesList", () => {
  /**
   * The single biggest saving of the projection. The API answers `{ list, activities }` where
   * `activities` is a map of complete Activity objects, 174 fields each, one per activity that
   * contributed a best effort. A curve over a year references dozens of them, and there is no
   * query parameter to exclude it.
   */
  it("drops the activities map entirely", () => {
    const projected = toCurveSeriesList(
      {
        list: [{ label: "Last 1y", secs: [5, 60], values: [900, 420] }],
        activities: {
          i1: { id: "i1", name: "…", average_wind_speed: 12, skyline_chart_bytes: "…" },
          i2: { id: "i2" }
        }
      },
      "secs"
    );

    expect(JSON.stringify(projected)).not.toContain("skyline_chart_bytes");
    expect(JSON.stringify(projected)).not.toContain("i2");
  });

  it("keeps the durations and the values held over them", () => {
    const projected = toCurveSeriesList(
      {
        list: [
          {
            label: "Last 1y",
            start_date_local: "2025-09-23",
            end_date_local: "2026-09-23",
            days: 365,
            secs: [5, 60, 300],
            values: [900, 420, 330],
            watts_per_kg: [12.5, 5.8, 4.6],
            // Intervals' own analysis, and pointers into data the agent does not have.
            submax_values: [[1, 2]],
            start_index: 10,
            activity_id: "i1",
            powerModels: {},
            ranks: []
          }
        ]
      },
      "secs"
    );

    expect(projected).toEqual([
      {
        label: "Last 1y",
        startDateLocal: "2025-09-23",
        endDateLocal: "2026-09-23",
        days: 365,
        secs: [5, 60, 300],
        values: [900, 420, 330],
        wattsPerKg: [12.5, 5.8, 4.6]
      }
    ]);
  });

  /**
   * `DataCurve` declares both `secs` and `distance`, so the axis cannot be inferred from the
   * payload. Under a key named `secs`, an agent would read 1000 metres as a quarter of an hour.
   */
  it("publishes a pace curve under `distance`, never under `secs`", () => {
    const projected = toCurveSeriesList(
      { list: [{ label: "5k", distance: [1000, 5000], values: [3.9, 3.4] }] },
      "distance"
    );

    expect(projected[0]).toEqual({
      label: "5k",
      startDateLocal: null,
      endDateLocal: null,
      days: null,
      distance: [1000, 5000],
      values: [3.9, 3.4]
    });
    expect(projected[0]).not.toHaveProperty("secs");
    expect(projected[0]).not.toHaveProperty("wattsPerKg");
  });

  /**
   * The same payload read on the other axis must not silently borrow the populated array: a
   * power curve whose `secs` is absent has no x axis, and saying so beats inventing one.
   */
  it("reads only the axis it was told, on a curve carrying both", () => {
    const both = { list: [{ label: "Last 1y", secs: [5, 60], distance: [1000, 5000], values: [900, 420] }] };

    expect(toCurveSeriesList(both, "secs")[0]).toMatchObject({ secs: [5, 60] });
    expect(toCurveSeriesList(both, "secs")[0]).not.toHaveProperty("distance");
    expect(toCurveSeriesList(both, "distance")[0]).toMatchObject({ distance: [1000, 5000] });
    expect(toCurveSeriesList(both, "distance")[0]).not.toHaveProperty("secs");
  });

  // Positional arrays: `secs[i]` pairs with `values[i]`. Dropping a non-number would shift every
  // later value onto the wrong duration, staying well-formed and plausible while being wrong.
  it("holds a gap in place rather than shifting the axis", () => {
    const projected = toCurveSeriesList(
      { list: [{ label: "Last 1y", secs: [5, null, 300], values: [900, 420, "n/a"] }] },
      "secs"
    );

    expect(projected[0]).toMatchObject({ secs: [5, null, 300], values: [900, 420, null] });
  });

  it("returns nothing for an unreadable payload rather than throwing", () => {
    expect(toCurveSeriesList(null, "secs")).toEqual([]);
    expect(toCurveSeriesList({ nope: true }, "secs")).toEqual([]);
  });
});
