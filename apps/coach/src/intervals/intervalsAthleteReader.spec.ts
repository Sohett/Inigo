import { afterEach, describe, expect, it, vi } from "vitest";
import { IntervalsIcuApiError, type IntervalsIcuClient } from "./client";
import { createIntervalsAthleteReader } from "./intervalsAthleteReader";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";

function readerWith(getAthleteProfile: () => Promise<unknown>) {
  const client = { getAthleteProfile } as unknown as IntervalsIcuClient;
  return createIntervalsAthleteReader(async () => client);
}

describe("createIntervalsAthleteReader", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the bike FTP and the physiology from one profile read", async () => {
    const reader = readerWith(async () => ({
      sportSettings: [{ types: ["Ride"], ftp: 240 }],
      sex: "F",
      icu_date_of_birth: "1990-04-12",
      height: 1.68,
      icu_weight: 61
    }));
    expect(await reader(ATHLETE_ID)).toEqual({ bikeFtpWatts: 240, bodyComplete: true });
  });

  it("reads an Intervals.icu refusal or outage as unknown instead of throwing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const reader = readerWith(async () => {
      throw new IntervalsIcuApiError("Unauthorized", { status: 401, endpoint: "/athlete/i1" });
    });
    expect(await reader(ATHLETE_ID)).toBeNull();
  });

  it("lets any other failure through", async () => {
    const reader = readerWith(async () => {
      throw new Error("boom");
    });
    await expect(reader(ATHLETE_ID)).rejects.toThrow("boom");
  });
});
