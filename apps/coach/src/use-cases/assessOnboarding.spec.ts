import { describe, expect, it, vi } from "vitest";
import type { FtpStatus, OnboardingFacts } from "../domain/onboarding";
import {
  assessOnboardingState,
  createAssessOnboarding,
  type BikeFtpReader
} from "./assessOnboarding";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";

const EMPTY: OnboardingFacts = {
  intervalsConnected: false,
  motivation: null,
  trainingBackground: null,
  activeGoalCount: 0,
  weeklyHours: null,
  ftpStatus: null,
  educationDone: false
};

const COMPLETE: OnboardingFacts = {
  intervalsConnected: true,
  motivation: "Préparer l'Étape du Tour",
  trainingBackground: "5 ans de vélo, 6 h par semaine",
  activeGoalCount: 1,
  weeklyHours: "6.0",
  ftpStatus: "to_test",
  educationDone: true
};

describe("assessOnboardingState", () => {
  it("lists every item as missing for an empty athlete", () => {
    const state = assessOnboardingState(EMPTY, null);
    expect(state.done).toEqual([]);
    expect(state.missing).toHaveLength(7);
    expect(state.complete).toBe(false);
  });

  it("splits a partial athlete into done and missing", () => {
    const state = assessOnboardingState(
      { ...EMPTY, motivation: "Reprendre", activeGoalCount: 2, weeklyHours: "4.5" },
      null
    );
    expect(state.done).toEqual(["motivation", "goal", "availability"]);
    expect(state.missing).toEqual([
      "training_background",
      "intervals_connected",
      "ftp",
      "education"
    ]);
    expect(state.complete).toBe(false);
  });

  it("is complete when every item is done", () => {
    const state = assessOnboardingState(COMPLETE, null);
    expect(state.missing).toEqual([]);
    expect(state.complete).toBe(true);
  });

  it("does not count blank answers or zero hours", () => {
    const state = assessOnboardingState(
      { ...COMPLETE, motivation: "  ", weeklyHours: "0.0" },
      null
    );
    expect(state.missing).toEqual(["motivation", "availability"]);
  });

  it.each<[FtpStatus, number | null, boolean]>([
    ["to_test", null, true],
    ["heart_rate_only", null, true],
    ["confirmed", 250, true],
    ["confirmed", null, false],
    ["confirmed", 0, false]
  ])("ftp %s with %s W on Intervals.icu is done: %s", (ftpStatus, watts, expected) => {
    const state = assessOnboardingState({ ...COMPLETE, ftpStatus }, watts);
    expect(state.done.includes("ftp")).toBe(expected);
    expect(state.complete).toBe(expected);
  });
});

describe("assessOnboarding", () => {
  function setup(facts: OnboardingFacts | null, watts: number | null = 250) {
    const bikeFtp = vi.fn<BikeFtpReader>(async () => watts);
    const useCase = createAssessOnboarding({
      facts: { getOnboardingFacts: vi.fn(async () => facts) },
      bikeFtp
    });
    return { useCase, bikeFtp };
  }

  it("reports an unknown athlete", async () => {
    const { useCase, bikeFtp } = setup(null);
    expect(await useCase.execute(ATHLETE_ID)).toEqual({ status: "unknown_athlete" });
    expect(bikeFtp).not.toHaveBeenCalled();
  });

  it("reads the bike FTP on Intervals.icu for a confirmed FTP", async () => {
    const { useCase, bikeFtp } = setup({ ...COMPLETE, ftpStatus: "confirmed" });
    const outcome = await useCase.execute(ATHLETE_ID);
    expect(bikeFtp).toHaveBeenCalledWith(ATHLETE_ID);
    expect(outcome).toMatchObject({ status: "assessed", state: { complete: true } });
  });

  it.each<[string, OnboardingFacts]>([
    ["the FTP is not confirmed", COMPLETE],
    ["Intervals.icu is not connected", { ...COMPLETE, ftpStatus: "confirmed", intervalsConnected: false }]
  ])("does not call Intervals.icu when %s", async (_label, facts) => {
    const { useCase, bikeFtp } = setup(facts);
    await useCase.execute(ATHLETE_ID);
    expect(bikeFtp).not.toHaveBeenCalled();
  });
});
