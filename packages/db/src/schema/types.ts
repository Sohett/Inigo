/**
 * Shared TypeScript shapes for JSONB columns and text-enum unions.
 *
 * Enums are stored as `text` + a CHECK constraint (see each table) and typed here
 * as string unions — more migration-friendly than native pg enums, and mirrored in
 * zod at the app boundary. JSONB shapes stay intentionally light for V0: they hold
 * evolving/narrative coaching data, not the quantified training truth (that lives on
 * Intervals.icu and is never duplicated here).
 */

/** Sports we coach. Multisport from day one via a plain text field. */
export type Sport = "bike" | "run" | "swim";

export type AthleteStatus = "active" | "paused" | "ended";
export type Sex = "M" | "F" | "other";
export type ThresholdSource = "test" | "estimated" | "manual";

export type GoalType = "event" | "performance" | "health";
export type GoalPriority = "A" | "B" | "C";
export type GoalStatus = "active" | "achieved" | "abandoned";

export type PlanStatus = "draft" | "active" | "completed" | "archived";
export type PlanAuthor = "ai" | "coach" | "system";
export type PhaseType = "base" | "build" | "peak" | "taper" | "transition";

export type PropositionStatus = "draft" | "validated" | "applied" | "rejected";
export type AdaptationTrigger =
  | "missed_session"
  | "low_readiness"
  | "illness"
  | "manual"
  | "scheduled";

export type CredentialProvider = "intervals_icu";

/** A single training zone bound (Coggan-style). */
export interface Zone {
  name?: string;
  min: number;
  max: number;
}

/** Structured availability constraints (the narrative version lives in `constraintsNotes`). */
export interface AthleteConstraints {
  weeklyHours?: number;
  fixedSlots?: { day: string; start?: string; durationMin?: number }[];
  equipment?: string[];
}

/** Coaching configuration derived from goals, not from live Intervals.icu data. */
export interface CoachingTargets {
  peakEvent?: string;
  ctlPeakTarget?: number;
  rampMax?: number;
  tsbWindow?: [number, number];
}

/** One planned week inside a mesocycle (`plan_week` folded into the block). */
export interface WeeklyTarget {
  weekStart: string;
  plannedTss?: number;
  plannedDurationS?: number;
  focus?: string;
  /** The week's key sessions, as written in the macro-plan (free text). */
  keySessions?: string;
  /** Projected end-of-week CTL from the plan (Intervals.icu is the live truth). */
  ctlTarget?: number;
}

/** A session proposed for a week, before it is pushed to the Intervals.icu calendar. */
export interface ProposedSession {
  date: string;
  sport: Sport;
  name?: string;
  description?: string;
  plannedTss?: number;
  plannedDurationS?: number;
  workoutDoc?: Record<string, unknown>;
}

export interface WeeklyPropositionPayload {
  sessions: ProposedSession[];
}

/** Output of the deterministic validator gate (code, not LLM judgement). */
export interface ValidatorResult {
  ok: boolean;
  errors?: string[];
  warnings?: string[];
}
