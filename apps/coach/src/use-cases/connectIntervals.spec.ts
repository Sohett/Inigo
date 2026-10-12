import { describe, expect, it, vi } from "vitest";
import { createConnectIntervals, type IntervalsCredentialCheck } from "./connectIntervals";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "a1b2c3d4e5f6g7h8i9j0";

function setup(check: IntervalsCredentialCheck) {
  const save = vi.fn(async () => undefined);
  const verify = vi.fn(async () => check);
  const useCase = createConnectIntervals({ verifier: { check: verify }, store: { save } });
  return { useCase, save, verify };
}

describe("connectIntervals", () => {
  it("stores the key with the Intervals.icu id once Intervals.icu accepts them", async () => {
    const { useCase, save, verify } = setup({ status: "valid", athleteName: "Thomas" });
    const outcome = await useCase.execute(ATHLETE_ID, KEY, "i42");

    expect(verify).toHaveBeenCalledWith(KEY, "i42");
    expect(save).toHaveBeenCalledWith(ATHLETE_ID, KEY, "i42");
    expect(outcome).toEqual({ status: "connected", intervalsAthleteId: "i42", athleteName: "Thomas" });
  });

  it.each(["invalid_credentials", "unknown_athlete_id"] as const)(
    "stores nothing and explains when Intervals.icu answers %s",
    async (status) => {
      const { useCase, save } = setup({ status });
      const outcome = await useCase.execute(ATHLETE_ID, KEY, "i42");

      expect(save).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ status });
      expect(JSON.stringify(outcome)).not.toContain(KEY);
    }
  );

  it("never stores anything when Intervals.icu is down", async () => {
    const save = vi.fn();
    const useCase = createConnectIntervals({
      verifier: { check: vi.fn(async () => Promise.reject(new Error("intervals down"))) },
      store: { save }
    });
    await expect(useCase.execute(ATHLETE_ID, KEY, "i42")).rejects.toThrow("intervals down");
    expect(save).not.toHaveBeenCalled();
  });
});
