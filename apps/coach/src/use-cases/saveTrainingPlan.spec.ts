import { describe, expect, it, vi } from "vitest";
import type { Goal, TrainingPlan, TrainingPlanInput } from "../domain/coaching";
import { createSaveTrainingPlan } from "./saveTrainingPlan";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_GOAL_ID = "33333333-3333-4333-8333-333333333333";
const PLAN_ID = "44444444-4444-4444-8444-444444444444";

const activeGoal: Goal = {
  id: GOAL_ID,
  title: "Ironman 70.3",
  description: null,
  type: "event",
  targetDate: "2026-12-06",
  priority: "A",
  status: "active",
  intervalsEventId: null
};

type Save = (input: TrainingPlanInput) => Promise<TrainingPlan | null>;

function setup(stored = vi.fn<Save>(async (input) => toPlan(input))) {
  const getGoals = vi.fn(async () => [activeGoal]);
  const forAthlete = vi.fn(() => ({ getGoals, saveTrainingPlan: stored }));
  const useCase = createSaveTrainingPlan({ repo: { forAthlete } });
  return { useCase, forAthlete, getGoals, stored };
}

function toPlan(input: TrainingPlanInput): TrainingPlan {
  return {
    id: input.id ?? PLAN_ID,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status ?? "draft",
    createdBy: "ai",
    goalId: input.goalId ?? null,
    rationale: null,
    blocks: []
  };
}

function planInput(fields: Partial<TrainingPlanInput> = {}): TrainingPlanInput {
  return {
    name: "Bloc 3 semaines",
    startDate: "2026-10-05",
    endDate: "2026-10-25",
    blocks: [{ phaseType: "build", startDate: "2026-10-05", endDate: "2026-10-25" }],
    ...fields
  };
}

describe("saveTrainingPlan", () => {
  it("creates a plan linked to an active goal of the athlete", async () => {
    const { useCase, forAthlete, stored } = setup();
    const outcome = await useCase.execute(ATHLETE_ID, planInput({ goalId: GOAL_ID }));
    expect(outcome.status).toBe("saved");
    expect(outcome.status === "saved" && outcome.plan.goalId).toBe(GOAL_ID);
    expect(forAthlete).toHaveBeenCalledWith(ATHLETE_ID);
    expect(stored).toHaveBeenCalledOnce();
  });

  it("creates a plan with an explicit null goal, without reading the goals", async () => {
    const { useCase, getGoals } = setup();
    const outcome = await useCase.execute(ATHLETE_ID, planInput({ goalId: null }));
    expect(outcome.status).toBe("saved");
    expect(getGoals).not.toHaveBeenCalled();
  });

  it("rejects a create that omits goalId, without touching the store", async () => {
    const { useCase, stored } = setup();
    const outcome = await useCase.execute(ATHLETE_ID, planInput());
    expect(outcome.status).toBe("invalid");
    expect(outcome.status === "invalid" && outcome.reason).toMatch(/goalId is required/);
    expect(stored).not.toHaveBeenCalled();
  });

  it("rejects a goal that is not an active goal of this athlete", async () => {
    // Another athlete's goal, or an achieved/abandoned one: neither is in get_goals.
    const { useCase, stored } = setup();
    const outcome = await useCase.execute(ATHLETE_ID, planInput({ goalId: OTHER_GOAL_ID }));
    expect(outcome.status).toBe("invalid");
    expect(outcome.status === "invalid" && outcome.reason).toMatch(/not an active goal/);
    expect(stored).not.toHaveBeenCalled();
  });

  it("updates a plan without goalId, keeping its link", async () => {
    const { useCase, getGoals } = setup();
    const outcome = await useCase.execute(ATHLETE_ID, planInput({ id: PLAN_ID }));
    expect(outcome.status).toBe("saved");
    expect(getGoals).not.toHaveBeenCalled();
  });

  it("checks the goal on update too", async () => {
    const { useCase, stored } = setup();
    const outcome = await useCase.execute(
      ATHLETE_ID,
      planInput({ id: PLAN_ID, goalId: OTHER_GOAL_ID })
    );
    expect(outcome.status).toBe("invalid");
    expect(stored).not.toHaveBeenCalled();
  });

  it("maps a plan that is not this athlete's to not_found", async () => {
    const { useCase } = setup(vi.fn<Save>(async () => null));
    const outcome = await useCase.execute(ATHLETE_ID, planInput({ id: PLAN_ID }));
    expect(outcome).toEqual({ status: "not_found" });
  });
});
