import type { AthleteRosterEntry } from "../domain/athleteRoster";

/** Port: every athlete with the state of their plan and latest proposition, in one read. */
export interface AthleteRosterReader {
  listRoster(): Promise<AthleteRosterEntry[]>;
}

export interface ListAdminAthletes {
  execute(): Promise<AthleteRosterEntry[]>;
}

/** The admin roster: every athlete. Filtering and sorting stay in the page. */
export function createListAdminAthletes(deps: { roster: AthleteRosterReader }): ListAdminAthletes {
  return {
    async execute(): Promise<AthleteRosterEntry[]> {
      return deps.roster.listRoster();
    }
  };
}
