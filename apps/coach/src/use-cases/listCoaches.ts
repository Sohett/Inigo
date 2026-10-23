import type { Coach } from "../domain/coach";
import type { CoachRepository } from "../repositories/coachRepository";

export interface ListCoaches {
  execute(): Promise<Coach[]>;
}

/** The admin's team (INI-85): every invited coach, signed in yet or not. */
export function createListCoaches(deps: { coaches: Pick<CoachRepository, "list"> }): ListCoaches {
  return {
    async execute() {
      return deps.coaches.list();
    }
  };
}
