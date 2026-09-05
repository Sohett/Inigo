import type { CreateSessionInput, ManagedAgentBrain } from "../brain/managedAgents";
import type { Athlete } from "../domain/athlete";
import type { BrainSessionTemplate } from "../domain/brain";
import type { AthleteRepository } from "../repositories/athleteRepository";
import type { BrainConfigRepository } from "../repositories/brainConfigRepository";

/**
 * Why a session could not be started. Both are normal business outcomes (the route
 * answers 404 / 409, not 502). Infrastructure failures are not here: they throw.
 */
export const StartSessionFailure = {
  /** No athlete carries this id. */
  AthleteNotFound: "athlete_not_found",
  /** `brain_config` holds no template, so there is nothing to create a session from. */
  BrainNotConfigured: "brain_not_configured"
} as const;

export type StartSessionFailure =
  (typeof StartSessionFailure)[keyof typeof StartSessionFailure];

export type StartSessionOutcome =
  | {
      status: "started";
      athleteId: string;
      sessionId: string;
      /** The agent version the new session captured. */
      agentVersion: number;
      /** The session the athlete was pointed at before, or null if they had none. */
      previousSessionId: string | null;
    }
  | { status: "failed"; reason: StartSessionFailure };

export interface StartAthleteSessionDeps {
  repo: AthleteRepository;
  brainConfig: BrainConfigRepository;
  brain: ManagedAgentBrain;
  /** Injected for a deterministic session title in tests. */
  now?: () => Date;
}

export interface StartAthleteSession {
  execute(athleteId: string): Promise<StartSessionOutcome>;
}

/**
 * A human-readable session title, so the Anthropic console shows who a session belongs
 * to and when it was opened. Middle dots rather than dashes, per the repo's copy rule.
 */
export function sessionTitle(athlete: Athlete, at: Date): string {
  const who = athlete.displayName ?? athlete.phoneNum;
  const day = at.toISOString().slice(0, 10);
  return `Inigo · ${who} · ${day}`;
}

/** Build the session params from the stored template. */
function toCreateSessionInput(
  template: BrainSessionTemplate,
  title: string
): CreateSessionInput {
  return {
    agentId: template.coordinatorAgentId,
    environmentId: template.environmentId,
    vaultIds: template.vaultIds,
    ...(template.memoryStoreId
      ? {
          resources: [
            {
              type: "memory_store" as const,
              memory_store_id: template.memoryStoreId,
              access: template.memoryStoreAccess
            }
          ]
        }
      : {}),
    title
  };
}

/**
 * Open a fresh Managed Agent session for one athlete and point their row at it.
 *
 * This is what makes a newly deployed agent version take effect: a session freezes the
 * agent config at creation, so the runtime only moves once a new session exists. The
 * session is created *before* the pointer is written, so a failed create never orphans
 * the athlete — they keep talking to their previous session until a create succeeds.
 * The previous session is left in place (its history stays readable in the console);
 * nothing routes to it any more.
 */
export function createStartAthleteSession(
  deps: StartAthleteSessionDeps
): StartAthleteSession {
  const now = deps.now ?? (() => new Date());

  return {
    async execute(athleteId: string): Promise<StartSessionOutcome> {
      const athlete = await deps.repo.findById(athleteId);
      if (!athlete) return { status: "failed", reason: StartSessionFailure.AthleteNotFound };

      const template = await deps.brainConfig.get();
      if (!template) {
        return { status: "failed", reason: StartSessionFailure.BrainNotConfigured };
      }

      const created = await deps.brain.createSession(
        toCreateSessionInput(template, sessionTitle(athlete, now()))
      );
      await deps.repo.setSession(athlete.id, created.sessionId, template.coordinatorAgentId);

      return {
        status: "started",
        athleteId: athlete.id,
        sessionId: created.sessionId,
        agentVersion: created.agentVersion,
        previousSessionId: athlete.anthropicSessionId
      };
    }
  };
}
