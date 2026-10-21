import type { ManagedAgentBrain } from "../brain/managedAgents";
import { turnMessage } from "../brain/taskEnvelope";
import type { ActiveSession, Athlete } from "../domain/athlete";
import { SessionStatus, type RunningSession, type SessionExchange } from "../domain/brain";
import type { AthleteRepository } from "../repositories/athleteRepository";
import { sessionTitle } from "./startAthleteSession";

/** How many of the last WhatsApp messages a new session picks up: the thread, not the history. */
export const CARRY_OVER_MESSAGES = 12;
/** Longest a carried message gets, in characters: a long plan recap is not worth replaying whole. */
export const CARRY_OVER_MESSAGE_CHARS = 500;

/** What refreshing an athlete's session ended in. */
export const RefreshStatus = {
  /**
   * The session runs the agent's latest version: nothing to do. Also when a concurrent message
   * just moved the athlete: `sessionId` is then the session it moved them to.
   */
  Current: "current",
  /** The session is outdated but a turn is in progress: moving now would cut it, so next message. */
  Busy: "busy",
  /** A new session on the latest version replaced the outdated one. */
  Migrated: "migrated",
  /** Checking or moving failed before the athlete was repointed: they stay on their session. */
  Failed: "failed"
} as const;

export type RefreshStatus = (typeof RefreshStatus)[keyof typeof RefreshStatus];

export type RefreshOutcome =
  | { status: typeof RefreshStatus.Current | typeof RefreshStatus.Busy; sessionId: string }
  | {
      status: typeof RefreshStatus.Migrated;
      sessionId: string;
      previousSessionId: string;
      /** The end of the previous conversation, oldest first, for the new session's first turn. */
      carryOver: SessionExchange[];
    }
  | { status: typeof RefreshStatus.Failed; sessionId: string; reason: string };

export interface RefreshAthleteSession {
  execute(athlete: Athlete, session: ActiveSession): Promise<RefreshOutcome>;
  /**
   * Archive the session a `migrated` outcome replaced, once the first turn reached the new one.
   * Best effort: an idle leftover session costs nothing. Never throws.
   */
  retire(previousSessionId: string): Promise<void>;
}

/**
 * Move an athlete off a session frozen on an outdated agent version (INI-27), lazily, when their
 * message comes in.
 *
 * A session keeps the agent version it was created with, so a deployed prompt only reaches an
 * athlete through a new session. Both versions are read live (the session's own, the agent's
 * latest), never stored: a copy could drift from the control plane, these cannot.
 *
 * The new session clones the old one's agent, environment, vaults and resources. What it cannot
 * clone is the conversation, so it gets the end of it (`carryOver`): the last WhatsApp messages,
 * as the athlete saw them. The durable facts (profile, goals, plan, log) are in Neon and on
 * Intervals.icu, which the agent reads anyway; only the short thread lived in the session.
 *
 * Moving is an optimisation, never a reason to lose a message: until the athlete is repointed,
 * any failure leaves them on their session (`failed`). The old session is archived by `retire`,
 * which the caller runs only once the first turn reached the new session: a turn that fails to
 * land leaves the old session as it was. (The carry-over itself is not replayed on a retry.)
 */
export function createRefreshAthleteSession(deps: {
  repo: Pick<AthleteRepository, "replaceSession" | "findById">;
  brain: Pick<ManagedAgentBrain, "readSession" | "latestAgentVersion" | "readExchanges" | "createSession" | "archiveSession">;
  now?: () => Date;
}): RefreshAthleteSession {
  const now = deps.now ?? (() => new Date());

  async function migrate(athlete: Athlete, session: ActiveSession, running: RunningSession): Promise<RefreshOutcome> {
    let created: { sessionId: string; agentVersion: number };
    let exchanges: SessionExchange[];
    let replaced: boolean;
    try {
      exchanges = await deps.brain.readExchanges(session.sessionId);
      created = await deps.brain.createSession({
        agentId: running.agentId,
        environmentId: running.environmentId,
        vaultIds: running.vaultIds,
        resources: running.resources,
        title: sessionTitle(athlete, now())
      });
      replaced = await deps.repo.replaceSession(athlete.id, session.sessionId, created.sessionId, running.agentId);
    } catch (error) {
      return failed(athlete, session, "could not open the new session", error);
    }
    if (!replaced) return joinConcurrentMove(athlete, session, created.sessionId);

    console.info(
      `[coach] athlete ${athlete.id} moved from session ${session.sessionId} to ${created.sessionId} (agent v${created.agentVersion})`
    );
    return {
      status: RefreshStatus.Migrated,
      sessionId: created.sessionId,
      previousSessionId: session.sessionId,
      carryOver: carryOverFrom(exchanges)
    };
  }

  /**
   * Another message of the same burst moved the athlete first (WhatsApp messages often come in
   * twos): the session opened here is dropped, and this message follows the winner's session, so
   * the conversation never splits in two. The winner's turn already carries the previous thread.
   */
  async function joinConcurrentMove(athlete: Athlete, session: ActiveSession, unusedSessionId: string): Promise<RefreshOutcome> {
    await archive(unusedSessionId);
    let live: ActiveSession | null;
    try {
      live = (await deps.repo.findById(athlete.id))?.activeSession ?? null;
    } catch (error) {
      return failed(athlete, session, "could not read the session another message moved to", error);
    }
    if (!live) return failed(athlete, session, "the athlete has no live session any more", null);
    return { status: RefreshStatus.Current, sessionId: live.sessionId };
  }

  /** Archive a session nothing routes to any more. Best effort: a leftover session costs nothing idle. */
  async function archive(sessionId: string): Promise<void> {
    try {
      await deps.brain.archiveSession(sessionId);
    } catch (error) {
      console.warn(`[coach] could not archive session ${sessionId}: ${errorMessage(error)}`);
    }
  }

  return {
    async execute(athlete: Athlete, session: ActiveSession): Promise<RefreshOutcome> {
      let running: RunningSession;
      let latestVersion: number;
      try {
        [running, latestVersion] = await Promise.all([
          deps.brain.readSession(session.sessionId),
          deps.brain.latestAgentVersion(session.agentId)
        ]);
      } catch (error) {
        return failed(athlete, session, "could not check the session version", error);
      }
      if (running.agentVersion >= latestVersion) return { status: RefreshStatus.Current, sessionId: session.sessionId };

      switch (running.status) {
        case SessionStatus.Running:
        case SessionStatus.Rescheduling:
          console.info(
            `[coach] session ${session.sessionId} of athlete ${athlete.id} is outdated (v${running.agentVersion} < v${latestVersion}) but busy: next message`
          );
          return { status: RefreshStatus.Busy, sessionId: session.sessionId };
        case SessionStatus.Idle:
        case SessionStatus.Terminated:
          return migrate(athlete, session, running);
      }
    },

    retire: archive
  };
}

/**
 * The end of a recorded conversation, ready to carry over: the athlete's own words read back from
 * each turn (turns they did not write are dropped), the coach's replies as sent, the last
 * `CARRY_OVER_MESSAGES` of them, each cut at `CARRY_OVER_MESSAGE_CHARS`. Exported for tests.
 */
export function carryOverFrom(exchanges: readonly SessionExchange[]): SessionExchange[] {
  return exchanges
    .flatMap((exchange): SessionExchange[] => {
      switch (exchange.author) {
        case "athlete": {
          const text = turnMessage(exchange.text);
          return text === null ? [] : [{ ...exchange, text }];
        }
        case "coach":
          return [exchange];
      }
    })
    .slice(-CARRY_OVER_MESSAGES)
    .map((exchange) => ({ ...exchange, text: truncate(exchange.text) }));
}

function truncate(text: string): string {
  return text.length <= CARRY_OVER_MESSAGE_CHARS ? text : `${text.slice(0, CARRY_OVER_MESSAGE_CHARS - 1)}…`;
}

function failed(athlete: Athlete, session: ActiveSession, reason: string, error: unknown): RefreshOutcome {
  const cause = error === null ? "" : `: ${errorMessage(error)}`;
  console.warn(`[coach] athlete ${athlete.id} stays on session ${session.sessionId}: ${reason}${cause}`);
  return { status: RefreshStatus.Failed, sessionId: session.sessionId, reason };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
