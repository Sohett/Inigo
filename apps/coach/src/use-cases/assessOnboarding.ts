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

/** Port: the athlete's bike FTP on Intervals.icu in watts, or null when none is set. */
export type BikeFtpReader = (athleteId: string) => Promise<number | null>;

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
function isFtpSettled(facts: OnboardingFacts, bikeFtpWatts: number | null): boolean {
  switch (facts.ftpStatus) {
    case null:
      return false;
    case "to_test":
    case "heart_rate_only":
      return true;
    case "confirmed":
      return bikeFtpWatts !== null && bikeFtpWatts > 0;
  }
}

function isDone(item: OnboardingItem, facts: OnboardingFacts, bikeFtpWatts: number | null): boolean {
  switch (item) {
    case "intervals_connected":
      return facts.intervalsConnected;
    case "motivation":
      return hasText(facts.motivation);
    case "training_background":
      return hasText(facts.trainingBackground);
    case "goal":
      return facts.activeGoalCount > 0;
    case "availability":
      return facts.weeklyHours !== null && Number(facts.weeklyHours) > 0;
    case "ftp":
      return isFtpSettled(facts, bikeFtpWatts);
    case "education":
      return facts.educationDone;
  }
}

/** Pure assessment of the checklist. `bikeFtpWatts` only matters for a confirmed FTP. */
export function assessOnboardingState(
  facts: OnboardingFacts,
  bikeFtpWatts: number | null
): OnboardingState {
  const done = ONBOARDING_ITEMS.filter((item) => isDone(item, facts, bikeFtpWatts));
  const missing = ONBOARDING_ITEMS.filter((item) => !done.includes(item));
  return { done, missing, complete: missing.length === 0 };
}

/** Intervals.icu is only asked when its answer can change the result. */
function needsBikeFtp(facts: OnboardingFacts): boolean {
  return facts.ftpStatus === "confirmed" && facts.intervalsConnected;
}

/**
 * Assess where an athlete stands in onboarding, from our data and, for a confirmed FTP,
 * Intervals.icu. Nothing is stored: the state is recomputed on every call. Infrastructure
 * failures (DB, Intervals.icu) throw.
 */
export function createAssessOnboarding(deps: {
  facts: OnboardingFactsReader;
  bikeFtp: BikeFtpReader;
}): AssessOnboarding {
  return {
    async execute(athleteId: string): Promise<AssessOnboardingOutcome> {
      const facts = await deps.facts.getOnboardingFacts(athleteId);
      if (!facts) return { status: AssessStatus.UnknownAthlete };
      const bikeFtpWatts = needsBikeFtp(facts) ? await deps.bikeFtp(athleteId) : null;
      return { status: AssessStatus.Assessed, state: assessOnboardingState(facts, bikeFtpWatts) };
    }
  };
}
