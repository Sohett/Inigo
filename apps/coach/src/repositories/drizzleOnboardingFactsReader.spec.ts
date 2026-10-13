import { describe, expect, it } from "vitest";
import { toOnboardingFacts, type OnboardingFactsRow } from "./drizzleOnboardingFactsReader";

const ROW: OnboardingFactsRow = {
  displayName: "Astrid",
  motivation: "Préparer un premier Ironman",
  trainingBackground: "Triathlète depuis 3 ans",
  pastCoaching: "Plan TrainerRoad",
  coachExpectations: "Un plan qui s'adapte",
  weeklyHours: "8.0",
  ftpStatus: "confirmed",
  educationDone: true,
  activeGoalCount: 1,
  detailedGoalCount: 1,
  intervalsConnected: true
};

describe("toOnboardingFacts", () => {
  it("maps a full row onto the domain facts", () => {
    expect(toOnboardingFacts(ROW)).toEqual(ROW);
  });

  it("reads an athlete without a profile as nothing answered yet", () => {
    const facts = toOnboardingFacts({
      displayName: null,
      motivation: null,
      trainingBackground: null,
      pastCoaching: null,
      coachExpectations: null,
      weeklyHours: null,
      ftpStatus: null,
      educationDone: null,
      activeGoalCount: 0,
      detailedGoalCount: 0,
      intervalsConnected: false
    });
    expect(facts.educationDone).toBe(false);
    expect(facts.ftpStatus).toBeNull();
  });
});
