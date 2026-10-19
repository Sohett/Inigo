import { canConnectIntervals, ConnectionResult, phoneHint } from "../domain/intervalsConnection";
import { verifyConnectLinkToken } from "../intervals/oauth/connectLinkToken";
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

export interface StartIntervalsConnection {
  execute(token: string | undefined): Promise<StartConnectionOutcome>;
}

/**
 * What a connection link opens (INI-69): whose account it connects and the way to Intervals.icu,
 * or why the link cannot be used. Each call draws a fresh flow (`state` and PKCE verifier), kept
 * in a cookie by the route, so only the browser that started the flow can finish it.
 */
export function createStartIntervalsConnection(deps: {
  oauth: IntervalsOAuth | null;
  repo: Pick<AthleteRepository, "findById">;
  now?: () => Date;
}): StartIntervalsConnection {
  const now = deps.now ?? (() => new Date());
  return {
    async execute(token) {
      if (!deps.oauth) return { status: ConnectionResult.Unavailable };
      const link = await verifyConnectLinkToken(token, deps.oauth.config.clientSecret, now());
      switch (link.status) {
        case "invalid":
          return { status: ConnectionResult.InvalidLink };
        case "expired":
          return { status: ConnectionResult.ExpiredLink };
        case "valid":
          break;
      }
      const athlete = await deps.repo.findById(link.athleteId);
      if (!athlete || !canConnectIntervals(athlete.status)) return { status: ConnectionResult.InvalidLink };

      // `token` is defined here: an absent token never verifies.
      const { authorizeUrl, flow } = await deps.oauth.client.begin(token ?? "");
      return {
        status: "ready",
        holder: { displayName: athlete.displayName, phoneHint: phoneHint(athlete.phoneNum) },
        authorizeUrl,
        flow
      };
    }
  };
}
