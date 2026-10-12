/** What Intervals.icu says about a key and an athlete id, tried together. */
export type IntervalsCredentialCheck =
  | { status: "valid"; athleteName: string | null }
  /** The key is refused (401/403). */
  | { status: "invalid_credentials" }
  /** The key works but no athlete carries this id (404). */
  | { status: "unknown_athlete_id" };

/** Port: try a key and an Intervals.icu athlete id against Intervals.icu. Outages throw. */
export interface IntervalsCredentialVerifier {
  check(apiKey: string, intervalsAthleteId: string): Promise<IntervalsCredentialCheck>;
}

/** Port: store an athlete's Intervals.icu credential (key encrypted at rest, id in clear). */
export interface IntervalsCredentialStore {
  save(athleteId: string, apiKey: string, intervalsAthleteId: string): Promise<void>;
}

/** Never carries the key: this goes back to the agent as is. */
export type ConnectIntervalsOutcome =
  | { status: "connected"; intervalsAthleteId: string; athleteName: string | null }
  | { status: "invalid_credentials"; reason: string }
  | { status: "unknown_athlete_id"; reason: string };

export interface ConnectIntervals {
  execute(athleteId: string, apiKey: string, intervalsAthleteId: string): Promise<ConnectIntervalsOutcome>;
}

/**
 * Connect an athlete's Intervals.icu account from the key and athlete id they gave the
 * onboarding agent (INI-50). Nothing is stored unless Intervals.icu accepts the pair, and the id
 * is always stored with the key (the resolver needs both). Transitional until OAuth.
 */
export function createConnectIntervals(deps: {
  verifier: IntervalsCredentialVerifier;
  store: IntervalsCredentialStore;
}): ConnectIntervals {
  return {
    async execute(athleteId, apiKey, intervalsAthleteId): Promise<ConnectIntervalsOutcome> {
      const check = await deps.verifier.check(apiKey, intervalsAthleteId);
      switch (check.status) {
        case "invalid_credentials":
          return {
            status: "invalid_credentials",
            reason: "Intervals.icu refuses this API key: ask the athlete to copy it again from Settings, Developer Settings."
          };
        case "unknown_athlete_id":
          return {
            status: "unknown_athlete_id",
            reason: `The key works but no athlete ${intervalsAthleteId} exists: ask for the athlete id shown next to the key.`
          };
        case "valid":
          await deps.store.save(athleteId, apiKey, intervalsAthleteId);
          return { status: "connected", intervalsAthleteId, athleteName: check.athleteName };
      }
    }
  };
}
