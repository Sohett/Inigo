import type { AthleteAccountRepository } from "../repositories/athleteAccountRepository";
import type { AthleteRepository } from "../repositories/athleteRepository";

/**
 * Where a link sent to an athlete can lead (INI-85). A closed list: an agent names a destination,
 * never a URL, so no message, however crafted, can turn a link into a way off Inigo.
 */
export const AthleteLinkDestination = {
  /** Connect Intervals.icu by OAuth (INI-69). */
  IntervalsConnect: "intervals_connect"
} as const;

export type AthleteLinkDestination = (typeof AthleteLinkDestination)[keyof typeof AthleteLinkDestination];

/** Goes back to the agent as is: the link is meant for the athlete. */
export type AthleteLinkOutcome =
  | { status: "link"; url: string; expiresAt: string }
  /** This destination, or sign in itself, is not set up on this deployment (local, preview). */
  | { status: "unavailable"; reason: string }
  | { status: "unknown_athlete"; reason: string };

/** Port: a link that signs this athlete's existing user in and lands them on `path`. */
export interface SignInLinkIssuer {
  issue(athleteId: string, path: string): Promise<{ url: string; expiresAt: Date }>;
}

export interface CreateAthleteLink {
  execute(athleteId: string, destination: AthleteLinkDestination): Promise<AthleteLinkOutcome>;
}

/**
 * The link an agent sends on WhatsApp so the athlete reaches a page of Inigo in one click, already
 * signed in (INI-85). Everything starts from WhatsApp: the conversation is the only proof of who
 * the athlete is, and the link carries it. Short lived and single use (Better Auth).
 *
 * In order: the destination's page, the athlete, **their user** (created here on their first
 * link, INI-87: signing in never creates one), then the link that signs that user in.
 */
export function createCreateAthleteLink(deps: {
  issuer: SignInLinkIssuer | null;
  /** Whether the Intervals.icu OAuth app is configured (INI-69). */
  intervalsOAuthConfigured: boolean;
  repo: Pick<AthleteRepository, "findById">;
  /** Null, like `issuer`, when sign in is not configured on this deployment. */
  accounts: AthleteAccountRepository | null;
}): CreateAthleteLink {
  return {
    async execute(athleteId, destination) {
      const path = pathOf(destination, deps.intervalsOAuthConfigured);
      if (path === null) {
        return {
          status: "unavailable",
          reason: "The Intervals.icu connection is not open on this deployment: tell the athlete it is temporarily unavailable."
        };
      }
      if (!deps.issuer || !deps.accounts) {
        return {
          status: "unavailable",
          reason: "Links to Inigo are not available on this deployment: tell the athlete it is temporarily unavailable."
        };
      }
      const athlete = await deps.repo.findById(athleteId);
      if (!athlete) return { status: "unknown_athlete", reason: `No athlete ${athleteId}: pass the inigo_athlete_id of the envelope.` };

      await deps.accounts.ensure(athlete);
      const { url, expiresAt } = await deps.issuer.issue(athlete.id, path);
      return { status: "link", url, expiresAt: expiresAt.toISOString() };
    }
  };
}

/** The page a destination opens, or null when it is not available on this deployment. */
function pathOf(destination: AthleteLinkDestination, intervalsOAuthConfigured: boolean): string | null {
  switch (destination) {
    case AthleteLinkDestination.IntervalsConnect:
      return intervalsOAuthConfigured ? "/connect/intervals" : null;
  }
}
