import type { AthleteRepository } from "../repositories/athleteRepository";
import { signConnectLinkToken } from "../intervals/oauth/connectLinkToken";
import type { IntervalsOAuthConfig } from "../intervals/oauth/credentials";

/** Goes back to the agent as is: the link is meant for the athlete, nothing here is a secret. */
export type ConnectLinkOutcome =
  | { status: "link"; url: string; expiresAt: string }
  /** OAuth is not set up on this deployment (local, preview): nothing can be connected. */
  | { status: "oauth_unavailable"; reason: string }
  | { status: "unknown_athlete"; reason: string };

export interface CreateIntervalsConnectLink {
  execute(athleteId: string): Promise<ConnectLinkOutcome>;
}

/**
 * The link an agent sends on WhatsApp so the athlete connects Intervals.icu by OAuth
 * (INI-69). It opens our page, which hands over to Intervals.icu. Signed and short-lived, so it
 * can only ever connect the athlete it was made for.
 */
export function createCreateIntervalsConnectLink(deps: {
  oauth: IntervalsOAuthConfig | null;
  repo: Pick<AthleteRepository, "findById">;
  now?: () => Date;
}): CreateIntervalsConnectLink {
  const now = deps.now ?? (() => new Date());
  return {
    async execute(athleteId) {
      if (!deps.oauth) {
        return {
          status: "oauth_unavailable",
          reason: "The Intervals.icu connection is not open on this deployment: tell the athlete it is temporarily unavailable."
        };
      }
      const athlete = await deps.repo.findById(athleteId);
      if (!athlete) return { status: "unknown_athlete", reason: `No athlete ${athleteId}: pass the inigo_athlete_id of the envelope.` };

      const { token, expiresAt } = await signConnectLinkToken(athlete.id, deps.oauth.clientSecret, now());
      const url = new URL("/connect/intervals", deps.oauth.publicUrl);
      url.searchParams.set("t", token);
      return { status: "link", url: url.toString(), expiresAt: expiresAt.toISOString() };
    }
  };
}
