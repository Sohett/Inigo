/**
 * Onboarding business model (INI-42): what "onboarding done" means, independent of the
 * DB and of Intervals.icu. The state is never stored, it is assessed from these facts.
 */

/**
 * How the bike FTP was settled at onboarding. Mirrors the DB CHECK values, redeclared
 * here so the domain owns its own enum.
 */
export const FTP_STATUSES = ["confirmed", "to_test", "heart_rate_only"] as const;
export type FtpStatus = (typeof FTP_STATUSES)[number];

/** The checks, all blocking: the athlete is handed to the coordinator once every one is done. */
export type OnboardingItem =
  | "identity"
  | "motivation"
  | "goal"
  | "goal_details"
  | "expectations"
  | "training_background"
  | "availability"
  | "intervals_connected"
  | "body"
  | "ftp"
  | "education";

/** Every item, in the order the conversation usually covers them. */
export const ONBOARDING_ITEMS: readonly OnboardingItem[] = [
  "identity",
  "motivation",
  "goal",
  "goal_details",
  "expectations",
  "training_background",
  "availability",
  "intervals_connected",
  "body",
  "ftp",
  "education"
];

/** What our own data says about an athlete's onboarding (Intervals.icu data comes separately). */
export interface OnboardingFacts {
  /** A usable Intervals.icu credential is stored (key and Intervals athlete id). */
  intervalsConnected: boolean;
  /** How the athlete wants to be called. */
  displayName: string | null;
  motivation: string | null;
  trainingBackground: string | null;
  activeGoalCount: number;
  /** Active main goals (priority A) whose target result and past experience are both told. */
  detailedGoalCount: number;
  pastCoaching: string | null;
  coachExpectations: string | null;
  /** Usual weekly training time, hours (decimal string, as stored). */
  weeklyHours: string | null;
  ftpStatus: FtpStatus | null;
  educationDone: boolean;
}

export interface OnboardingState {
  done: OnboardingItem[];
  missing: OnboardingItem[];
  /** Every item is done: the athlete can be handed to the coordinator. */
  complete: boolean;
}

/** Where a freshly registered athlete stands: nothing answered yet, no need to ask the DB. */
export const NOTHING_DONE: OnboardingState = {
  done: [],
  missing: [...ONBOARDING_ITEMS],
  complete: false
};

/**
 * How a new athlete is onboarded, edited from the admin. Onboarding is active only once the
 * onboarding agent and the access code are both set.
 */
export interface OnboardingSettings {
  onboardingAgentId: string | null;
  /** The agent an athlete is handed to once onboarding is complete (INI-49). */
  coordinatorAgentId: string | null;
  accessCode: string | null;
}
