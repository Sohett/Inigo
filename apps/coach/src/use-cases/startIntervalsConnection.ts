import { ConnectionResult } from "../domain/intervalsConnection";
import { verifyConnectLinkToken } from "../intervals/oauth/connectLinkToken";
import type { IntervalsOAuthConfig } from "../intervals/oauth/credentials";
import { authorizeUrl } from "../intervals/oauth/intervalsOAuth";

export type StartConnectionOutcome =
  | { status: "ready"; authorizeUrl: string }
  | {
      status: typeof ConnectionResult.ExpiredLink | typeof ConnectionResult.InvalidLink | typeof ConnectionResult.Unavailable;
    };

export interface StartIntervalsConnection {
  execute(token: string | undefined): StartConnectionOutcome;
}

/**
 * What the connection page shows for a link (INI-69): the button to Intervals.icu, or why the
 * link cannot be used. The link token itself travels as the OAuth `state`.
 */
export function createStartIntervalsConnection(deps: {
  oauth: IntervalsOAuthConfig | null;
  now?: () => Date;
}): StartIntervalsConnection {
  const now = deps.now ?? (() => new Date());
  return {
    execute(token) {
      if (!deps.oauth) return { status: ConnectionResult.Unavailable };
      const link = verifyConnectLinkToken(token, deps.oauth.clientSecret, now());
      switch (link.status) {
        case "invalid":
          return { status: ConnectionResult.InvalidLink };
        case "expired":
          return { status: ConnectionResult.ExpiredLink };
        case "valid":
          // `token` is defined here: an absent token never verifies.
          return { status: "ready", authorizeUrl: authorizeUrl(deps.oauth, token ?? "") };
      }
    }
  };
}
