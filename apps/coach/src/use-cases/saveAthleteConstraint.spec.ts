import { describe, expect, it, vi } from "vitest";
import type { AthleteConstraint, ConstraintInput } from "../domain/coaching";
import { createSaveAthleteConstraint } from "./saveAthleteConstraint";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";

type Upsert = (input: ConstraintInput) => Promise<AthleteConstraint | null>;

function setup(
  stored = vi.fn<Upsert>(async (input) => ({ id: "c1", ...input }))
) {
  const forAthlete = vi.fn(() => ({ upsertConstraint: stored }));
  const useCase = createSaveAthleteConstraint({ repo: { forAthlete } });
  return { useCase, forAthlete, stored };
}

describe("saveAthleteConstraint", () => {
  it("saves a recurring fixed session, scoped to the athlete", async () => {
    const { useCase, forAthlete } = setup();
    const outcome = await useCase.execute(ATHLETE_ID, {
      kind: "fixed_session",
      weekday: 2,
      activity: "strength"
    });
    expect(outcome).toEqual({
      status: "saved",
      constraint: { id: "c1", kind: "fixed_session", weekday: 2, activity: "strength" }
    });
    expect(forAthlete).toHaveBeenCalledWith(ATHLETE_ID);
  });

  it("saves a single-day dated constraint", async () => {
    const { useCase } = setup();
    const outcome = await useCase.execute(ATHLETE_ID, {
      kind: "unavailable",
      startDate: "2026-10-12",
      endDate: "2026-10-12"
    });
    expect(outcome.status).toBe("saved");
  });

  it.each<[string, ConstraintInput, RegExp]>([
    ["neither recurring nor dated", { kind: "unavailable" }, /exactly one/],
    [
      "both recurring and dated",
      { kind: "unavailable", weekday: 1, startDate: "2026-10-12", endDate: "2026-10-12" },
      /exactly one/
    ],
    ["a start without an end", { kind: "limited", startDate: "2026-10-12" }, /both startDate and endDate/],
    [
      "an end before its start",
      { kind: "limited", startDate: "2026-10-14", endDate: "2026-10-12" },
      /on or after/
    ],
    ["a fixed session without activity", { kind: "fixed_session", weekday: 2 }, /activity/]
  ])("rejects %s without touching the store", async (_label, input, reason) => {
    const { useCase, stored } = setup();
    const outcome = await useCase.execute(ATHLETE_ID, input);
    expect(outcome.status).toBe("invalid");
    expect(outcome.status === "invalid" && outcome.reason).toMatch(reason);
    expect(stored).not.toHaveBeenCalled();
  });

  it("reports not_found when the store does not own the id", async () => {
    const { useCase } = setup(vi.fn<Upsert>(async () => null));
    const outcome = await useCase.execute(ATHLETE_ID, {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "unavailable",
      weekday: 7
    });
    expect(outcome).toEqual({ status: "not_found" });
  });
});
