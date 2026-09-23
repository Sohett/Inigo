import { describe, it, expect } from "vitest";
import {
  COACHED_ACTIVITY_FIELDS,
  WELLNESS_DAY_FIELDS,
  type CoachedActivityField
} from "../../domain/training";
import {
  toCoachedActivities,
  toCoachedActivity,
  toCurveSeriesList,
  toWellnessDay
} from "./project";

describe("field lists", () => {
  it.each([
    ["activity", COACHED_ACTIVITY_FIELDS],
    ["wellness", WELLNESS_DAY_FIELDS]
  ])("declares each %s field once", (_label, fields) => {
    expect(new Set(fields).size).toBe(fields.length);
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
    const projected = toCurveSeriesList({
      list: [{ label: "Last 1y", secs: [5, 60], values: [900, 420] }],
      activities: {
        i1: { id: "i1", name: "…", average_wind_speed: 12, skyline_chart_bytes: "…" },
        i2: { id: "i2" }
      }
    });

    expect(JSON.stringify(projected)).not.toContain("skyline_chart_bytes");
    expect(JSON.stringify(projected)).not.toContain("i2");
  });

  it("keeps the durations and the values held over them", () => {
    const projected = toCurveSeriesList({
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
    });

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

  it("reads a pace curve, whose durations come as distances", () => {
    const projected = toCurveSeriesList({ list: [{ label: "5k", distance: [1000, 5000], values: [3.9, 3.4] }] });

    expect(projected[0]?.secs).toEqual([1000, 5000]);
    expect(projected[0]).not.toHaveProperty("wattsPerKg");
  });

  it("returns nothing for an unreadable payload rather than throwing", () => {
    expect(toCurveSeriesList(null)).toEqual([]);
    expect(toCurveSeriesList({ nope: true })).toEqual([]);
  });
});
