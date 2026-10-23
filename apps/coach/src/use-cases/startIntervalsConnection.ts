import { canConnectIntervals, ConnectionResult, phoneHint } from "../domain/intervalsConnection";
import { SignInState, type SignedIn } from "../domain/signedIn";
import type { ConnectionFlow, IntervalsOAuth } from "../intervals/oauth/intervalsOAuth";
import type { AthleteRepository } from "../repositories/athleteRepository";

/** Who a link connects, shown on the page so a forwarded link is recognised for what it is. */
export interface LinkHolder {
  displayName: string | null;
  /** Last two digits of their WhatsApp number. */
  phoneHint: string | null;
}

export type StartConnectionOutcome =
  | {
      status: "ready";
      holder: LinkHolder;
      /** Intervals.icu's consent page, carrying the flow's `state` and PKCE challenge. */
      authorizeUrl: string;
      /** To keep in an HttpOnly cookie before leaving: the callback requires it back. */
      flow: ConnectionFlow;
    }
  | {
      status: typeof ConnectionResult.ExpiredLink | typeof ConnectionResult.InvalidLink | typeof ConnectionResult.Unavailable;
    };

/** A visit to the connection page. */
export interface ConnectionVisit {
  /** Who this browser is signed in as (INI-85): the magic link signed the athlete in on the way. */
  signedIn: SignedIn;
  /** The magic link that led here could not sign in: used already, or past its hour. */
  linkFailed: boolean;
}

export interface StartIntervalsConnection {
  execute(visit: ConnectionVisit): Promise<StartConnectionOutcome>;
}

/**
 * What the connection page shows (INI-69): whose account it connects and the way to Intervals.icu,
 * or why it cannot. The athlete comes from their session, opened by the magic link sent on
 * WhatsApp (INI-85). Each call draws a fresh flow (`state` and PKCE verifier), kept in a cookie
 * by the route, so only the browser that started the flow can finish it.
 */
export function createStartIntervalsConnection(deps: {
  oauth: IntervalsOAuth | null;
  repo: Pick<AthleteRepository, "findById">;
}): StartIntervalsConnection {
  return {
    async execute(visit) {
      if (!deps.oauth) return { status: ConnectionResult.Unavailable };
      const visitor = visitingAthlete(visit);
      if (visitor.refused) return { status: visitor.refused };

      const athlete = await deps.repo.findById(visitor.athleteId);
      if (!athlete || !canConnectIntervals(athlete.status)) return { status: ConnectionResult.InvalidLink };

      const { authorizeUrl, flow } = await deps.oauth.client.begin();
      return {
        status: "ready",
        holder: { displayName: athlete.displayName, phoneHint: phoneHint(athlete.phoneNum) },
        authorizeUrl,
        flow
      };
    }
  };
}

/**
 * The athlete on the page, or why there is none. A signed in athlete wins over a failed link: a
 * second click on the same link, from the browser the first one signed in, still shows the page.
 */
function visitingAthlete(
  visit: ConnectionVisit
):
  | { refused: null; athleteId: string }
  | { refused: typeof ConnectionResult.ExpiredLink | typeof ConnectionResult.InvalidLink | typeof ConnectionResult.Unavailable } {
  switch (visit.signedIn.state) {
    case SignInState.Athlete:
      return { refused: null, athleteId: visit.signedIn.athleteId };
    case SignInState.Unavailable:
      return { refused: ConnectionResult.Unavailable };
    case SignInState.SignedOut:
    case SignInState.Staff:
      return { refused: visit.linkFailed ? ConnectionResult.ExpiredLink : ConnectionResult.InvalidLink };
  }
}
