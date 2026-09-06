import { z } from "zod";
import type { ManagedAgentBrain } from "../brain/managedAgents";
import type { Athlete } from "../domain/athlete";
import type { SessionElements } from "../domain/brain";
import type { AthleteRepository } from "../repositories/athleteRepository";

/**
 * Why a session could not be started. All are normal business outcomes (the route
 * answers 404 / 409 / 400, not 502). Infrastructure failures are not here: they throw.
 */
export const StartSessionFailure = {
  /** No athlete carries this id. */
  AthleteNotFound: "athlete_not_found",
  /**
   * The athlete has no session to clone and the caller supplied no elements to build a
   * first one from. The admin resolves this by picking from the live inventory.
   */
  NoSessionToClone: "no_session_to_clone",
  /** The supplied elements were malformed. */
  InvalidElements: "invalid_elements"
} as const;

export type StartSessionFailure =
  (typeof StartSessionFailure)[keyof typeof StartSessionFailure];

/**
 * Elements for an athlete's *first* session, chosen by the admin from the live
 * inventory. Ignored when the athlete already has a session: that one is cloned, because
 * what already runs is a better source of truth than anything a form can restate.
 */
export const sessionElementsSchema = z.object({
  agentId: z.string().trim().startsWith("agent_", "must start with agent_"),
  environmentId: z.string().trim().startsWith("env_", "must start with env_"),
  vaultIds: z.array(z.string().trim().startsWith("vlt_", "must start with vlt_")).default([]),
  memoryStoreId: z
    .string()
    .trim()
    .startsWith("memstore_", "must start with memstore_")
    .nullish()
    .transform((value) => value ?? null),
  memoryStoreAccess: z.enum(["read_only", "read_write"]).default("read_only")
});

export type SessionElementsInput = z.input<typeof sessionElementsSchema>;

export type StartSessionOutcome =
  | {
      status: "started";
      athleteId: string;
      sessionId: string;
      agentVersion: number;
      /** The session the athlete was pointed at before, or null for a first one. */
      previousSessionId: string | null;
      /** Whether the elements came from the previous session or from the caller. */
      source: "cloned" | "chosen";
    }
  | { status: "failed"; reason: StartSessionFailure; issues?: string[] };

export interface StartAthleteSessionDeps {
  repo: AthleteRepository;
  brain: ManagedAgentBrain;
  /** Injected for a deterministic session title in tests. */
  now?: () => Date;
}

export interface StartAthleteSession {
  execute(athleteId: string, elements?: unknown): Promise<StartSessionOutcome>;
}

/**
 * A human-readable session title, so the Anthropic console shows who a session belongs
 * to and when it was opened. Middle dots rather than dashes, per the repo's copy rule.
 */
export function sessionTitle(athlete: Athlete, at: Date): string {
  const who = athlete.displayName ?? athlete.phoneNum;
  return `Inigo · ${who} · ${at.toISOString().slice(0, 10)}`;
}

/** Turn the flat form input into the elements a session is created from. */
function toSessionElements(parsed: z.output<typeof sessionElementsSchema>): SessionElements {
  return {
    agentId: parsed.agentId,
    environmentId: parsed.environmentId,
    vaultIds: parsed.vaultIds,
    resources: parsed.memoryStoreId
      ? [
          {
            kind: "memory_store",
            memoryStoreId: parsed.memoryStoreId,
            access: parsed.memoryStoreAccess,
            instructions: null
          }
        ]
      : []
  };
}

/**
 * Open a fresh Managed Agent session for one athlete and point their row at it.
 *
 * This is what makes a newly deployed agent version take effect: a session freezes the
 * agent config at creation, so the runtime only moves once a new session exists.
 *
 * Where the elements come from is the whole design. When the athlete already runs a
 * session, we **read that session back** and recreate it — the running session is the
 * authoritative record of which agent, environment, vaults and memory store this athlete
 * uses, and unlike a stored copy it cannot drift from the control plane. Referencing the
 * agent by id re-pins its latest version, which is the one thing we deliberately change.
 * Only a first session needs elements supplied, chosen from the live inventory.
 *
 * The new session is created *before* the pointer is written, so a failed create never
 * orphans the athlete: they keep talking to their previous session until one succeeds.
 * The previous session is left in place (its history stays readable); nothing routes to
 * it any more.
 */
export function createStartAthleteSession(
  deps: StartAthleteSessionDeps
): StartAthleteSession {
  const now = deps.now ?? (() => new Date());

  return {
    async execute(athleteId: string, elements?: unknown): Promise<StartSessionOutcome> {
      const athlete = await deps.repo.findById(athleteId);
      if (!athlete) return { status: "failed", reason: StartSessionFailure.AthleteNotFound };

      let source: "cloned" | "chosen";
      let sessionElements: SessionElements;

      if (athlete.anthropicSessionId) {
        const running = await deps.brain.readSession(athlete.anthropicSessionId);
        sessionElements = {
          agentId: running.agentId,
          environmentId: running.environmentId,
          vaultIds: running.vaultIds,
          resources: running.resources
        };
        source = "cloned";
      } else {
        if (elements === undefined || elements === null) {
          return { status: "failed", reason: StartSessionFailure.NoSessionToClone };
        }
        const parsed = sessionElementsSchema.safeParse(elements);
        if (!parsed.success) {
          return {
            status: "failed",
            reason: StartSessionFailure.InvalidElements,
            issues: parsed.error.issues.map(
              (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
            )
          };
        }
        sessionElements = toSessionElements(parsed.data);
        source = "chosen";
      }

      const created = await deps.brain.createSession({
        ...sessionElements,
        title: sessionTitle(athlete, now())
      });
      await deps.repo.setSession(athlete.id, created.sessionId, sessionElements.agentId);

      return {
        status: "started",
        athleteId: athlete.id,
        sessionId: created.sessionId,
        agentVersion: created.agentVersion,
        previousSessionId: athlete.anthropicSessionId,
        source
      };
    }
  };
}
