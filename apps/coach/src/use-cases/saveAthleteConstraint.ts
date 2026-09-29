import type { AthleteConstraint, ConstraintInput } from "../domain/coaching";
import { UUID_PATTERN } from "../mcp/athleteId";

/** The slice of the athlete-data repository this use-case needs (scoped per athlete). */
export interface ConstraintWriterRepository {
  forAthlete(athleteId: string): {
    upsertConstraint(input: ConstraintInput): Promise<AthleteConstraint | null>;
  };
}

export type SaveConstraintOutcome =
  | { status: "saved"; constraint: AthleteConstraint }
  /** The rule is incoherent; `reason` is written for the agent to fix its call. */
  | { status: "invalid"; reason: string }
  /** A replace targeted an id that is unknown or belongs to another athlete. */
  | { status: "not_found" };

export interface SaveAthleteConstraint {
  execute(athleteId: string, input: ConstraintInput): Promise<SaveConstraintOutcome>;
}

/**
 * Why a rule is incoherent, or null when it is valid. Mirrors the `athlete_constraint`
 * CHECKs so the agent gets a readable reason instead of a Postgres error.
 */
function findRuleProblem(rule: ConstraintInput): string | null {
  const recurring = rule.weekday !== undefined;
  const dated = rule.startDate !== undefined || rule.endDate !== undefined;
  if (recurring === dated) {
    return "A constraint is either recurring (weekday) or dated (startDate + endDate), exactly one.";
  }
  if (dated) {
    const { startDate, endDate } = rule;
    if (startDate === undefined || endDate === undefined) {
      return "A dated constraint needs both startDate and endDate (same day for a single day).";
    }
    // Plain YYYY-MM-DD strings compare chronologically.
    if (endDate < startDate) return "endDate must be on or after startDate.";
  }
  if (rule.kind === "fixed_session" && rule.activity === undefined) {
    return "A fixed_session constraint needs the activity it pins to the slot.";
  }
  return null;
}

/**
 * Create a schedule constraint, or replace one whole (`input.id`, see `ConstraintInput`).
 * Business outcomes (incoherent rule, unknown id) are returned, not thrown; infrastructure
 * failures throw.
 */
export function createSaveAthleteConstraint(deps: {
  repo: ConstraintWriterRepository;
}): SaveAthleteConstraint {
  return {
    async execute(athleteId: string, input: ConstraintInput): Promise<SaveConstraintOutcome> {
      // A malformed id can't be one of this athlete's rows: not_found, not a Postgres error.
      if (input.id !== undefined && !UUID_PATTERN.test(input.id)) return { status: "not_found" };
      const problem = findRuleProblem(input);
      if (problem) return { status: "invalid", reason: problem };
      const constraint = await deps.repo.forAthlete(athleteId).upsertConstraint(input);
      return constraint ? { status: "saved", constraint } : { status: "not_found" };
    }
  };
}
