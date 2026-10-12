/**
 * Onboarding business model (INI-42): what "onboarding done" means, independent of the
 * DB and of Intervals.icu. The state is never stored, it is assessed from these facts.
 */

/**
 * How the bike FTP was settled at onboarding. Mirrors the DB CHECK values, redeclared
 * here so the domain owns its own enum.
 */
export type FtpStatus = "confirmed" | "to_test" | "heart_rate_only";

/** The seven checks, all blocking: the athlete is handed to the coordinator once every one is done. */
export type OnboardingItem =
  | "intervals_connected"
  | "motivation"
  | "training_background"
  | "goal"
  | "availability"
  | "ftp"
  | "education";

/** Every item, in the order the conversation usually covers them. */
export const ONBOARDING_ITEMS: readonly OnboardingItem[] = [
  "motivation",
  "training_background",
  "goal",
  "availability",
  "intervals_connected",
  "ftp",
  "education"
];

/** What our own data says about an athlete's onboarding (Intervals.icu data comes separately). */
export interface OnboardingFacts {
  /** A usable Intervals.icu credential is stored (key and Intervals athlete id). */
  intervalsConnected: boolean;
  motivation: string | null;
  trainingBackground: string | null;
  activeGoalCount: number;
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
