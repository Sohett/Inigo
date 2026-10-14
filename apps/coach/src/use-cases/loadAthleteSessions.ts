import type { ManagedAgentBrain } from "../brain/managedAgents";
import type { Athlete, AthleteSession } from "../domain/athlete";
import type { BrainInventory, RunningSession } from "../domain/brain";
import type { AthleteRepository } from "../repositories/athleteRepository";
import { settle } from "./settle";

/** One athlete plus what their session actually runs on, read live from the control plane. */
export interface AthleteSessions {
  athlete: Athlete;
  /** The live session, or null when the athlete has none or it could not be read. */
  session: RunningSession | null;
  /** Why the session could not be read. Null when there was nothing to read, or it worked. */
  sessionError: string | null;
  /** Sessions a newer one replaced, newest first. Still readable at Anthropic. */
  pastSessions: AthleteSession[];
  /** What exists in the control plane, to open a first session. Null if unreachable. */
  inventory: BrainInventory | null;
  inventoryError: string | null;
}

export interface LoadAthleteSessionsDeps {
  repo: AthleteRepository;
  brain: ManagedAgentBrain;
}

export interface LoadAthleteSessions {
  /** Null when no athlete has this id. */
  execute(athleteId: string): Promise<AthleteSessions | null>;
}

/**
 * The session block of the athlete page, read from the control plane rather than any
 * stored copy of it.
 *
 * A stale pointer to a deleted session is exactly the kind of drift this block exists to
 * surface, so an unreadable session renders as a visible problem, not as a 500. The
 * inventory only serves the first-session form, so losing it degrades the block. Our own
 * tables (the athlete, its session history) failing is a DB outage, and fails the page.
 */
export function createLoadAthleteSessions(deps: LoadAthleteSessionsDeps): LoadAthleteSessions {
  return {
    async execute(athleteId: string): Promise<AthleteSessions | null> {
      const athlete = await deps.repo.findById(athleteId);
      if (!athlete) return null;

      const [history, live, inventory] = await Promise.all([
        deps.repo.listSessions(athlete.id),
        athlete.activeSession
          ? settle(deps.brain.readSession(athlete.activeSession.sessionId))
          : Promise.resolve({ value: null, error: null }),
        settle(deps.brain.listInventory())
      ]);

      return {
        athlete,
        session: live.value,
        sessionError: live.error,
        pastSessions: history.filter((session) => session.endedAt !== null),
        inventory: inventory.value,
        inventoryError: inventory.error
      };
    }
  };
}
