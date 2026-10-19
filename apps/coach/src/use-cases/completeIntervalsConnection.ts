import type { ManagedAgentBrain } from "../brain/managedAgents";
import { formatIntervalsConnectedTurn } from "../brain/taskEnvelope";
import type { Athlete } from "../domain/athlete";
import { canConnectIntervals, ConnectionResult, missingScopes } from "../domain/intervalsConnection";
import { readState, sameNonce, verifyConnectLinkToken } from "../intervals/oauth/connectLinkToken";
import type { IntervalsOAuthConfig } from "../intervals/oauth/credentials";
import type { IntervalsTokenExchanger } from "../intervals/oauth/intervalsOAuth";
import type { AthleteRepository } from "../repositories/athleteRepository";
import { AssessStatus, type AssessOnboarding } from "./assessOnboarding";
import type { IntervalsCredentialStore } from "./connectIntervals";

/** The query string Intervals.icu sends back to the callback. */
export interface ConnectionCallback {
  state?: string;
  code?: string;
  error?: string;
  /** The nonce from the cookie `/connect/intervals/start` set in this browser. */
  browserNonce?: string;
}

/** Port: the Intervals.icu athlete id an athlete is already connected to, or null. Reads no secret. */
export type IntervalsAccountReader = (athleteId: string) => Promise<string | null>;

/** Whether the athlete's agent heard about the connection (only an onboarding athlete's does). */
export const AgentNotice = {
  Notified: "notified",
  /** Not in onboarding, or no session: nobody to tell. */
  NotNeeded: "not_needed",
  /** The connection is stored but telling the agent failed (logged): the athlete's next message carries it. */
  Failed: "failed"
} as const;

export type AgentNotice = (typeof AgentNotice)[keyof typeof AgentNotice];

export type CompleteConnectionOutcome =
  | { result: typeof ConnectionResult.Connected; agent: AgentNotice }
  | { result: Exclude<ConnectionResult, typeof ConnectionResult.Connected> };

export interface CompleteIntervalsConnection {
  execute(callback: ConnectionCallback): Promise<CompleteConnectionOutcome>;
}

export interface CompleteIntervalsConnectionDeps {
  /** Null when OAuth is not set up on this deployment. */
  oauth: { config: IntervalsOAuthConfig; exchanger: IntervalsTokenExchanger } | null;
  repo: Pick<AthleteRepository, "findById">;
  store: IntervalsCredentialStore;
  connectedAccount: IntervalsAccountReader;
  assessOnboarding: AssessOnboarding;
  brain: Pick<ManagedAgentBrain, "appendUserMessage">;
  now?: () => Date;
}

/**
 * The OAuth callback (INI-69): Intervals.icu sends the athlete back with a code, or a refusal.
 * Nothing is stored unless the link is ours and still valid, the flow comes back to the browser
 * that started it, the athlete can still be coached, the code trades for a token, every scope
 * the coach needs was granted, and the account is the one already connected, if any (never
 * swapped silently). Then the token is stored (encrypted, replacing any API key), and an athlete in onboarding gets a turn so their
 * agent confirms on WhatsApp without waiting for them to write.
 *
 * Refusals are returned; outages (Intervals.icu down, Neon down) throw, and the route shows the
 * failure page. Telling the agent never fails the connection: it is already stored.
 */
export function createCompleteIntervalsConnection(deps: CompleteIntervalsConnectionDeps): CompleteIntervalsConnection {
  const now = deps.now ?? (() => new Date());
  return {
    async execute(callback) {
      if (!deps.oauth) return { result: ConnectionResult.Unavailable };
      // Intervals.icu sends `error=access_denied` when the athlete declines.
      if (callback.error === "access_denied") return { result: ConnectionResult.Denied };
      if (callback.error) return { result: ConnectionResult.Failed };

      const state = readState(callback.state);
      if (!state) return { result: ConnectionResult.InvalidLink };
      if (!sameNonce(state.nonce, callback.browserNonce)) return { result: ConnectionResult.SessionMismatch };

      const link = verifyConnectLinkToken(state.token, deps.oauth.config.clientSecret, now());
      switch (link.status) {
        case "invalid":
          return { result: ConnectionResult.InvalidLink };
        case "expired":
          return { result: ConnectionResult.ExpiredLink };
        case "valid":
          break;
      }
      if (!callback.code) return { result: ConnectionResult.Failed };

      const athlete = await deps.repo.findById(link.athleteId);
      if (!athlete || !canConnectIntervals(athlete.status)) return { result: ConnectionResult.InvalidLink };

      const exchange = await deps.oauth.exchanger.exchange(callback.code);
      if (exchange.status === "rejected") {
        console.warn(`[coach] Intervals.icu refused the OAuth code for athlete ${athlete.id} (HTTP ${exchange.httpStatus})`);
        return { result: ConnectionResult.Failed };
      }
      const { token } = exchange;
      const missing = missingScopes(token.scopes);
      if (missing.length > 0) {
        console.warn(`[coach] athlete ${athlete.id} connected Intervals.icu without ${missing.join(", ")}: not stored`);
        return { result: ConnectionResult.MissingScopes };
      }

      const current = await deps.connectedAccount(athlete.id);
      if (current !== null && current !== token.intervalsAthleteId) {
        console.warn(`[coach] athlete ${athlete.id} tried to connect Intervals.icu ${token.intervalsAthleteId} over ${current}: refused`);
        return { result: ConnectionResult.OtherAccount };
      }

      await deps.store.save(athlete.id, { type: "oauth", accessToken: token.accessToken }, token.intervalsAthleteId);
      console.info(`[coach] athlete ${athlete.id} connected Intervals.icu ${token.intervalsAthleteId} by OAuth`);
      return { result: ConnectionResult.Connected, agent: await notifyAgent(athlete, deps, now()) };
    }
  };
}

/**
 * Tell the onboarding agent the athlete connected, with a fresh checklist (now reading
 * Intervals.icu with the new token). Only onboarding: the coordinator's prompt knows no such
 * event, and a reconnection after a revoked token is INI-71.
 */
async function notifyAgent(
  athlete: Athlete,
  deps: Pick<CompleteIntervalsConnectionDeps, "assessOnboarding" | "brain">,
  now: Date
): Promise<AgentNotice> {
  if (athlete.status !== "onboarding" || !athlete.activeSession) return AgentNotice.NotNeeded;
  try {
    const assessed = await deps.assessOnboarding.execute(athlete.id);
    if (assessed.status === AssessStatus.UnknownAthlete) return AgentNotice.Failed;
    await deps.brain.appendUserMessage(
      athlete.activeSession.sessionId,
      formatIntervalsConnectedTurn(athlete, assessed.state, now)
    );
    return AgentNotice.Notified;
  } catch (error) {
    console.error(`[coach] could not tell athlete ${athlete.id}'s agent about the Intervals.icu connection`, error);
    return AgentNotice.Failed;
  }
}
