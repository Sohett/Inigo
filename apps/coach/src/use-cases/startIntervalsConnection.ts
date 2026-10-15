import { canConnectIntervals, ConnectionResult, phoneHint } from "../domain/intervalsConnection";
import { bindState, newBrowserNonce, verifyConnectLinkToken } from "../intervals/oauth/connectLinkToken";
import type { IntervalsOAuthConfig } from "../intervals/oauth/credentials";
import { authorizeUrl } from "../intervals/oauth/intervalsOAuth";
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
      /** Intervals.icu's consent page, with the link token bound to `browserNonce` as `state`. */
      authorizeUrl: string;
      /** To set in an HttpOnly cookie before leaving: the callback requires it back. */
      browserNonce: string;
    }
  | {
      status: typeof ConnectionResult.ExpiredLink | typeof ConnectionResult.InvalidLink | typeof ConnectionResult.Unavailable;
    };

export interface StartIntervalsConnection {
  execute(token: string | undefined): Promise<StartConnectionOutcome>;
}

/**
 * What a connection link opens (INI-69): whose account it connects and the way to Intervals.icu,
 * or why the link cannot be used. Each call draws a fresh browser nonce, bound into the `state`
 * here and kept in a cookie by the route, so only the browser that started the flow can finish it.
 */
export function createStartIntervalsConnection(deps: {
  oauth: IntervalsOAuthConfig | null;
  repo: Pick<AthleteRepository, "findById">;
  now?: () => Date;
}): StartIntervalsConnection {
  const now = deps.now ?? (() => new Date());
  return {
    async execute(token) {
      if (!deps.oauth) return { status: ConnectionResult.Unavailable };
      const link = verifyConnectLinkToken(token, deps.oauth.clientSecret, now());
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

      const browserNonce = newBrowserNonce();
      return {
        status: "ready",
        holder: { displayName: athlete.displayName, phoneHint: phoneHint(athlete.phoneNum) },
        // `token` is defined here: an absent token never verifies.
        authorizeUrl: authorizeUrl(deps.oauth, bindState(token ?? "", browserNonce)),
        browserNonce
      };
    }
  };
}
