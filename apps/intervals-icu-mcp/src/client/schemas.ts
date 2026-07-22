import { z } from "zod";

/**
 * Intervals.icu returns large, evolving objects. We validate the fields we rely
 * on and keep everything else with `.catchall` so new API fields are passed
 * through untouched instead of being silently dropped or causing failures.
 */

const id = z.union([z.string(), z.number()]);

export const activitySchema = z
  .object({
    id,
    name: z.string().nullish(),
    type: z.string().nullish(),
    start_date_local: z.string().nullish(),
    distance: z.number().nullish(),
    moving_time: z.number().nullish(),
    elapsed_time: z.number().nullish(),
    icu_training_load: z.number().nullish()
  })
  .catchall(z.unknown());
export type Activity = z.infer<typeof activitySchema>;
export const activityListSchema = z.array(activitySchema);

export const intervalsSchema = z
  .object({
    id: id.nullish(),
    icu_intervals: z.array(z.record(z.string(), z.unknown())).nullish()
  })
  .catchall(z.unknown());
export type ActivityIntervals = z.infer<typeof intervalsSchema>;

export const streamSchema = z
  .object({
    type: z.string(),
    data: z.array(z.unknown())
  })
  .catchall(z.unknown());
export const streamListSchema = z.array(streamSchema);
export type ActivityStream = z.infer<typeof streamSchema>;

export const wellnessSchema = z
  .object({
    id: z.string().nullish(),
    ctl: z.number().nullish(),
    atl: z.number().nullish(),
    rampRate: z.number().nullish(),
    restingHR: z.number().nullish(),
    hrv: z.number().nullish(),
    weight: z.number().nullish(),
    sleepSecs: z.number().nullish()
  })
  .catchall(z.unknown());
export type Wellness = z.infer<typeof wellnessSchema>;
export const wellnessListSchema = z.array(wellnessSchema);

export const eventSchema = z
  .object({
    id: id.nullish(),
    start_date_local: z.string().nullish(),
    category: z.string().nullish(),
    name: z.string().nullish(),
    type: z.string().nullish(),
    description: z.string().nullish()
  })
  .catchall(z.unknown());
export type IntervalsEvent = z.infer<typeof eventSchema>;
export const eventListSchema = z.array(eventSchema);

export const athleteSchema = z
  .object({
    id: id.nullish(),
    name: z.string().nullish()
  })
  .catchall(z.unknown());
export type Athlete = z.infer<typeof athleteSchema>;

/**
 * Per-sport thresholds and zones (FTP, LTHR, max HR, threshold pace, power/HR/pace
 * zones). The full object carries ~60 fields; we validate the coach-controlled ones and
 * keep the rest with `.catchall` so a read-merge-write PUT never drops fields it didn't
 * touch. FTP/HR fields are integers, threshold pace and pace zones are floats.
 */
export const sportSettingsSchema = z
  .object({
    id: id.nullish(),
    type: z.string().nullish(),
    ftp: z.number().nullish(),
    indoor_ftp: z.number().nullish(),
    lthr: z.number().nullish(),
    max_hr: z.number().nullish(),
    threshold_pace: z.number().nullish(),
    power_zones: z.array(z.number()).nullish(),
    hr_zones: z.array(z.number()).nullish(),
    pace_zones: z.array(z.number()).nullish()
  })
  .catchall(z.unknown());
export type SportSettings = z.infer<typeof sportSettingsSchema>;

export const gearSchema = z
  .object({
    id: id.nullish(),
    name: z.string().nullish(),
    type: z.string().nullish()
  })
  .catchall(z.unknown());
export const gearListSchema = z.array(gearSchema);
export type Gear = z.infer<typeof gearSchema>;

/**
 * Curve endpoints (power/HR/pace) return shapes that vary by sport and account.
 * We pass them through unvalidated rather than guess at a brittle schema.
 * VERIFY against the live Swagger before tightening.
 */
export const curveSchema = z.unknown();

/** A single fitness data point derived from wellness records. */
export interface FitnessPoint {
  date: string;
  ctl: number | null;
  atl: number | null;
  form: number | null;
}
