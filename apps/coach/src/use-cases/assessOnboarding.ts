import {
  ONBOARDING_ITEMS,
  type OnboardingFacts,
  type OnboardingItem,
  type OnboardingState
} from "../domain/onboarding";

/** Port: our onboarding facts for one athlete, or null when the athlete is unknown. */
export interface OnboardingFactsReader {
  getOnboardingFacts(athleteId: string): Promise<OnboardingFacts | null>;
}

/** What Intervals.icu says about the athlete, for the checks whose data lives there. */
export interface IntervalsAthleteFacts {
  /** The bike FTP in watts, or null when none is set. */
  bikeFtpWatts: number | null;
  /** Sex, birth date, height and weight are all filled in. */
  bodyComplete: boolean;
}

/** Port: read the athlete's Intervals.icu facts (only called once the account is connected). */
export type IntervalsAthleteReader = (athleteId: string) => Promise<IntervalsAthleteFacts>;

/** Whether an athlete's onboarding could be assessed. */
export const AssessStatus = {
  Assessed: "assessed",
  UnknownAthlete: "unknown_athlete"
} as const;

export type AssessStatus = (typeof AssessStatus)[keyof typeof AssessStatus];

export type AssessOnboardingOutcome =
  | { status: typeof AssessStatus.Assessed; state: OnboardingState }
  | { status: typeof AssessStatus.UnknownAthlete };

export interface AssessOnboarding {
  execute(athleteId: string): Promise<AssessOnboardingOutcome>;
}

function hasText(value: string | null): boolean {
  return value !== null && value.trim() !== "";
}

/**
 * The FTP check. A confirmed FTP must really be on Intervals.icu: a fresh account can carry a
 * default value, so the explicit status is what proves the athlete settled it.
 */
function isFtpSettled(facts: OnboardingFacts, intervals: IntervalsAthleteFacts | null): boolean {
  switch (facts.ftpStatus) {
    case null:
      return false;
    case "to_test":
    case "heart_rate_only":
      return true;
    case "confirmed":
      return intervals !== null && intervals.bikeFtpWatts !== null && intervals.bikeFtpWatts > 0;
  }
}

function isDone(
  item: OnboardingItem,
  facts: OnboardingFacts,
  intervals: IntervalsAthleteFacts | null
): boolean {
  switch (item) {
    case "identity":
      return hasText(facts.displayName);
    case "motivation":
      return hasText(facts.motivation);
    case "goal":
      return facts.activeGoalCount > 0;
    case "goal_details":
      return facts.detailedGoalCount > 0;
    case "expectations":
      return hasText(facts.pastCoaching) && hasText(facts.coachExpectations);
    case "training_background":
      return hasText(facts.trainingBackground);
    case "availability":
      return facts.weeklyHours !== null && Number(facts.weeklyHours) > 0;
    case "intervals_connected":
      return facts.intervalsConnected;
    case "body":
      return intervals !== null && intervals.bodyComplete;
    case "ftp":
      return isFtpSettled(facts, intervals);
    case "education":
      return facts.educationDone;
  }
}

/**
 * Pure assessment of the checklist. `intervals` is null while the account is not connected:
 * the checks whose data lives on Intervals.icu (physiology, a confirmed FTP) are then not done.
 */
export function assessOnboardingState(
  facts: OnboardingFacts,
  intervals: IntervalsAthleteFacts | null
): OnboardingState {
  const done = ONBOARDING_ITEMS.filter((item) => isDone(item, facts, intervals));
  const missing = ONBOARDING_ITEMS.filter((item) => !done.includes(item));
  return { done, missing, complete: missing.length === 0 };
}

/**
 * Assess where an athlete stands in onboarding, from our data and, once the account is
 * connected, Intervals.icu (physiology, confirmed FTP). Nothing is stored: the state is
 * recomputed on every call. Infrastructure failures (DB, Intervals.icu) throw.
 */
export function createAssessOnboarding(deps: {
  facts: OnboardingFactsReader;
  intervals: IntervalsAthleteReader;
}): AssessOnboarding {
  return {
    async execute(athleteId: string): Promise<AssessOnboardingOutcome> {
      const facts = await deps.facts.getOnboardingFacts(athleteId);
      if (!facts) return { status: AssessStatus.UnknownAthlete };
      const intervals = facts.intervalsConnected ? await deps.intervals(athleteId) : null;
      return { status: AssessStatus.Assessed, state: assessOnboardingState(facts, intervals) };
    }
  };
}
