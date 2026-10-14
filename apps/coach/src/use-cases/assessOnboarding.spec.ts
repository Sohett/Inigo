import { describe, expect, it, vi } from "vitest";
import type { FtpStatus, OnboardingFacts } from "../domain/onboarding";
import {
  assessOnboardingState,
  createAssessOnboarding,
  type IntervalsAthleteFacts,
  type IntervalsAthleteReader
} from "./assessOnboarding";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";

const EMPTY: OnboardingFacts = {
  intervalsConnected: false,
  displayName: null,
  motivation: null,
  trainingBackground: null,
  activeGoalCount: 0,
  detailedGoalCount: 0,
  pastCoaching: null,
  coachExpectations: null,
  weeklyHours: null,
  ftpStatus: null,
  educationDone: false
};

const COMPLETE: OnboardingFacts = {
  intervalsConnected: true,
  displayName: "Astrid",
  motivation: "Préparer l'Étape du Tour",
  trainingBackground: "5 ans de vélo, 6 h par semaine",
  activeGoalCount: 1,
  detailedGoalCount: 1,
  pastCoaching: "Plan TrainerRoad pendant 2 ans",
  coachExpectations: "Un plan qui s'adapte à mes gardes",
  weeklyHours: "6.0",
  ftpStatus: "to_test",
  educationDone: true
};

const INTERVALS_COMPLETE: IntervalsAthleteFacts = { bikeFtpWatts: 250, bodyComplete: true };

describe("assessOnboardingState", () => {
  it("lists every item as missing for an empty athlete", () => {
    const state = assessOnboardingState(EMPTY, null);
    expect(state.done).toEqual([]);
    expect(state.missing).toHaveLength(11);
    expect(state.complete).toBe(false);
  });

  it("splits a partial athlete into done and missing", () => {
    const state = assessOnboardingState(
      { ...EMPTY, displayName: "Astrid", motivation: "Reprendre", activeGoalCount: 2, weeklyHours: "4.5" },
      null
    );
    expect(state.done).toEqual(["identity", "motivation", "goal", "availability"]);
    expect(state.missing).toEqual([
      "goal_details",
      "expectations",
      "training_background",
      "education",
      "intervals_connected",
      "body",
      "ftp"
    ]);
    expect(state.complete).toBe(false);
  });

  it("is complete when every item is done", () => {
    const state = assessOnboardingState(COMPLETE, INTERVALS_COMPLETE);
    expect(state.missing).toEqual([]);
    expect(state.complete).toBe(true);
  });

  it("does not count blank answers or zero hours", () => {
    const state = assessOnboardingState(
      { ...COMPLETE, displayName: " ", motivation: "  ", weeklyHours: "0.0" },
      INTERVALS_COMPLETE
    );
    expect(state.missing).toEqual(["identity", "motivation", "availability"]);
  });

  it("needs a goal with its target result and experience told", () => {
    const state = assessOnboardingState({ ...COMPLETE, detailedGoalCount: 0 }, INTERVALS_COMPLETE);
    expect(state.missing).toEqual(["goal_details"]);
  });

  it.each<[string, Partial<OnboardingFacts>]>([
    ["past coaching", { pastCoaching: null }],
    ["expectations from Inigo", { coachExpectations: " " }]
  ])("needs the %s for the expectations item", (_label, missing) => {
    const state = assessOnboardingState({ ...COMPLETE, ...missing }, INTERVALS_COMPLETE);
    expect(state.missing).toEqual(["expectations"]);
  });

  it.each<[string, IntervalsAthleteFacts | null, boolean]>([
    ["complete on Intervals.icu", INTERVALS_COMPLETE, true],
    ["partial on Intervals.icu", { bikeFtpWatts: 250, bodyComplete: false }, false],
    ["unknown (account not connected)", null, false]
  ])("body %s is done: %s", (_label, intervals, expected) => {
    const state = assessOnboardingState(COMPLETE, intervals);
    expect(state.done.includes("body")).toBe(expected);
  });

  it.each<[FtpStatus, number | null, boolean]>([
    ["to_test", null, true],
    ["heart_rate_only", null, true],
    ["confirmed", 250, true],
    ["confirmed", null, false],
    ["confirmed", 0, false]
  ])("ftp %s with %s W on Intervals.icu is done: %s", (ftpStatus, watts, expected) => {
    const state = assessOnboardingState(
      { ...COMPLETE, ftpStatus },
      { bikeFtpWatts: watts, bodyComplete: true }
    );
    expect(state.done.includes("ftp")).toBe(expected);
    expect(state.complete).toBe(expected);
  });
});

describe("assessOnboarding", () => {
  function setup(facts: OnboardingFacts | null, intervalsFacts: IntervalsAthleteFacts | null = INTERVALS_COMPLETE) {
    const intervals = vi.fn<IntervalsAthleteReader>(async () => intervalsFacts);
    const useCase = createAssessOnboarding({
      facts: { getOnboardingFacts: vi.fn(async () => facts) },
      intervals
    });
    return { useCase, intervals };
  }

  it("reports an unknown athlete", async () => {
    const { useCase, intervals } = setup(null);
    expect(await useCase.execute(ATHLETE_ID)).toEqual({ status: "unknown_athlete" });
    expect(intervals).not.toHaveBeenCalled();
  });

  it("reads Intervals.icu once the account is connected", async () => {
    const { useCase, intervals } = setup({ ...COMPLETE, ftpStatus: "confirmed" });
    const outcome = await useCase.execute(ATHLETE_ID);
    expect(intervals).toHaveBeenCalledWith(ATHLETE_ID);
    expect(outcome).toMatchObject({ status: "assessed", state: { complete: true } });
  });

  it("keeps the Intervals.icu checks missing when it cannot be read", async () => {
    const { useCase } = setup({ ...COMPLETE, ftpStatus: "confirmed" }, null);
    const outcome = await useCase.execute(ATHLETE_ID);
    expect(outcome).toMatchObject({ status: "assessed", state: { missing: ["body", "ftp"] } });
  });

  it("does not call Intervals.icu while the account is not connected", async () => {
    const { useCase, intervals } = setup({ ...COMPLETE, intervalsConnected: false });
    const outcome = await useCase.execute(ATHLETE_ID);
    expect(intervals).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      status: "assessed",
      state: { missing: ["intervals_connected", "body"] }
    });
  });
});
