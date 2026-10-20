import type { CredentialAuthType, PlanStatus, PropositionStatus } from "@inigo/db";
import type { AthleteStatus } from "./athlete";

/**
 * One line of the admin roster (INI-52): who the athlete is and where their coaching stands,
 * all read from Neon. Intervals.icu activity and agent cost stay on the athlete page, where
 * one call per athlete is affordable.
 */
export interface AthleteRosterEntry {
  id: string;
  displayName: string | null;
  phoneNum: string | null;
  whatsappLid: string | null;
  status: AthleteStatus;
  createdAt: Date;
  /** The athlete's active plan, else their most recent one. Null when they have none. */
  plan: { name: string; status: PlanStatus } | null;
  /** The most recent weekly proposition (latest week, then latest written). Null when none. */
  latestProposition: { weekStart: string; status: PropositionStatus } | null;
  /**
   * The stored Intervals.icu credential: how it authenticates and when it was last stored. Null
   * when the athlete never connected. A stored token can still have been revoked on Intervals.icu
   * since: that only shows on the next call (INI-71).
   */
  intervals: { authType: CredentialAuthType; connectedAt: Date } | null;
}
