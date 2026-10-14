import type { AthleteRosterEntry } from "../domain/athleteRoster";

/** Port: every athlete with the state of their plan and latest proposition, in one read. */
export interface AthleteRosterReader {
  listRoster(): Promise<AthleteRosterEntry[]>;
}

/** Why an athlete needs the admin's eye, from our own data only. */
export type AttentionReason =
  /** Active, but no plan is running: the coordinator has nothing to schedule from. */
  | "no_active_plan"
  /** The latest week is proposed or validated but not applied to the calendar yet. */
  | "proposition_pending";

export interface AdminAthleteRow extends AthleteRosterEntry {
  /** Null when nothing in our data calls for a look. */
  attention: AttentionReason | null;
}

export interface ListAdminAthletes {
  execute(): Promise<AdminAthleteRow[]>;
}

function isPending(proposition: AthleteRosterEntry["latestProposition"]): boolean {
  if (!proposition) return false;
  switch (proposition.status) {
    case "draft":
    case "validated":
      return true;
    case "applied":
    case "rejected":
      return false;
  }
}

/**
 * What calls for a look depends on where the athlete is in their lifecycle: only an active
 * athlete is expected to have a plan and weekly propositions. Onboarding progress needs
 * Intervals.icu to be assessed, so it is shown on the athlete page, not here.
 */
export function attentionOf(entry: AthleteRosterEntry): AttentionReason | null {
  switch (entry.status) {
    case "onboarding":
    case "paused":
    case "ended":
    case "blocked":
      return null;
    case "active":
      if (entry.plan?.status !== "active") return "no_active_plan";
      if (isPending(entry.latestProposition)) return "proposition_pending";
      return null;
  }
}

/** The admin roster: every athlete, with what calls for a look. Filtering and sorting stay in the page. */
export function createListAdminAthletes(deps: { roster: AthleteRosterReader }): ListAdminAthletes {
  return {
    async execute(): Promise<AdminAthleteRow[]> {
      const entries = await deps.roster.listRoster();
      return entries.map((entry) => ({ ...entry, attention: attentionOf(entry) }));
    }
  };
}
