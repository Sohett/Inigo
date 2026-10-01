import type { Goal, TrainingPlan, TrainingPlanInput } from "../domain/coaching";

/** The slice of the athlete-data repository this use-case needs (scoped per athlete). */
export interface TrainingPlanWriterRepository {
  forAthlete(athleteId: string): {
    getGoals(): Promise<Goal[]>;
    saveTrainingPlan(input: TrainingPlanInput): Promise<TrainingPlan | null>;
  };
}

export type SaveTrainingPlanOutcome =
  | { status: "saved"; plan: TrainingPlan }
  /** The goal link is missing or wrong; `reason` is written for the agent to fix its call. */
  | { status: "invalid"; reason: string }
  /** An update targeted a plan id that is unknown or belongs to another athlete. */
  | { status: "not_found" };

export interface SaveTrainingPlan {
  execute(athleteId: string, input: TrainingPlanInput): Promise<SaveTrainingPlanOutcome>;
}

/**
 * Create or update the athlete's macro plan. A new plan must say which goal it serves:
 * `goalId` is required on create, as an active goal of this athlete or an explicit null
 * when the athlete has none, so a plan can no longer end up unlinked by omission.
 * Business outcomes are returned, not thrown; infrastructure failures throw.
 */
export function createSaveTrainingPlan(deps: { repo: TrainingPlanWriterRepository }): SaveTrainingPlan {
  return {
    async execute(athleteId: string, input: TrainingPlanInput): Promise<SaveTrainingPlanOutcome> {
      const scoped = deps.repo.forAthlete(athleteId);
      const isCreate = input.id === undefined;

      if (isCreate && input.goalId === undefined) {
        return {
          status: "invalid",
          reason:
            "goalId is required when creating a plan: pass the id of the goal it serves " +
            "(from get_goals), or null if the athlete has no goal."
        };
      }

      if (typeof input.goalId === "string") {
        const goals = await scoped.getGoals();
        if (!goals.some((goal) => goal.id === input.goalId)) {
          return {
            status: "invalid",
            reason: `Goal ${input.goalId} is not an active goal of this athlete (see get_goals).`
          };
        }
      }

      const plan = await scoped.saveTrainingPlan(input);
      return plan ? { status: "saved", plan } : { status: "not_found" };
    }
  };
}
