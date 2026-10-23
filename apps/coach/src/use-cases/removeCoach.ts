import { normaliseCoachEmail } from "../domain/coach";
import type { CoachRepository } from "../repositories/coachRepository";

export type RemoveCoachOutcome =
  | { status: "removed" }
  | { status: "not_invited" }
  /** A coach never removes themselves: the last one would lock everyone out of the admin. */
  | { status: "cannot_remove_yourself" };

export interface RemoveCoach {
  execute(email: string, removedBy: string): Promise<RemoveCoachOutcome>;
}

/**
 * Take the admin away from a coach, or withdraw an invitation (INI-85). Their invitation and their
 * account go together, so their sessions end at once and they cannot sign in again.
 */
export function createRemoveCoach(deps: { coaches: Pick<CoachRepository, "remove"> }): RemoveCoach {
  return {
    async execute(email, removedBy) {
      const removed = normaliseCoachEmail(email);
      if (removed === normaliseCoachEmail(removedBy)) return { status: "cannot_remove_yourself" };
      return (await deps.coaches.remove(removed)) ? { status: "removed" } : { status: "not_invited" };
    }
  };
}
