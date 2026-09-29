/** The slice of the athlete-data repository this use-case needs (scoped per athlete). */
export interface ConstraintDeleterRepository {
  forAthlete(athleteId: string): { deleteConstraint(id: string): Promise<boolean> };
}

export type DeleteConstraintOutcome = { status: "deleted" } | { status: "not_found" };

export interface DeleteAthleteConstraint {
  execute(athleteId: string, constraintId: string): Promise<DeleteConstraintOutcome>;
}

/**
 * Delete one of the athlete's schedule constraints (unknown or foreign id → not_found).
 * A dated constraint needs no deleting once over: it simply stops being returned.
 */
export function createDeleteAthleteConstraint(deps: {
  repo: ConstraintDeleterRepository;
}): DeleteAthleteConstraint {
  return {
    async execute(athleteId: string, constraintId: string): Promise<DeleteConstraintOutcome> {
      const deleted = await deps.repo.forAthlete(athleteId).deleteConstraint(constraintId);
      return deleted ? { status: "deleted" } : { status: "not_found" };
    }
  };
}
