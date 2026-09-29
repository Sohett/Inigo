import { describe, it, expect, vi } from "vitest";
import {
  createReadActivityStreams,
  MAX_STREAM_VALUES,
  ReadStreamsFailure,
  type ReadStreamsOutcome
} from "./readActivityStreams";
import type { StreamWindow } from "../domain/training";
import type { ResolveClient } from "../intervals/mcp-tools/result";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVITY_ID = "i1234567";

function build(streams: unknown[]) {
  const getActivityStreams = vi.fn(async () => streams);
  const resolveClient = (async () => ({ getActivityStreams })) as unknown as ResolveClient;
  return { readStreams: createReadActivityStreams({ resolveClient }), getActivityStreams };
}

function series(type: string, data: unknown[], extra: Record<string, unknown> = {}) {
  return { type, data, name: type, anomalies: [], custom: false, ...extra };
}

/** Narrows a successful outcome, failing loudly rather than silently reading `undefined`. */
function read(outcome: ReadStreamsOutcome): StreamWindow {
  expect(outcome.status).toBe("read");
  return (outcome as Extract<ReadStreamsOutcome, { status: "read" }>).window;
}

const window = { athleteId: ATHLETE_ID, activityId: ACTIVITY_ID, types: ["watts"] };

describe("readActivityStreams", () => {
  it("returns the requested window at full resolution", async () => {
    const data = Array.from({ length: 100 }, (_, index) => index);
    const { readStreams, getActivityStreams } = build([series("watts", data)]);

    const outcome = await readStreams.execute({ ...window, startIndex: 10, endIndex: 20 });

    expect(getActivityStreams).toHaveBeenCalledWith(ACTIVITY_ID, ["watts"]);
    expect(outcome).toEqual({
      status: "read",
      window: {
        activityId: ACTIVITY_ID,
        startIndex: 10,
        endIndex: 20,
        series: [{ type: "watts", data: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] }]
      }
    });
  });

  /**
   * The reason this use-case exists. The constructor programs 30/15 Rønnestad intervals and the
   * analyst checks they were executed: any bucket average coarser than a few seconds turns the
   * alternation into a flat line. This asserts the shape survives byte for byte.
   */
  it("preserves a 30/15 alternation exactly, without smoothing", async () => {
    // Six repetitions of 30 s at 300 W then 15 s at 150 W.
    const data: number[] = [];
    for (let rep = 0; rep < 6; rep += 1) {
      data.push(...Array.from({ length: 30 }, () => 300), ...Array.from({ length: 15 }, () => 150));
    }
    const { readStreams } = build([series("watts", data)]);

    const outcome = await readStreams.execute({ ...window, startIndex: 0, endIndex: 270 });

    expect(read(outcome).series[0]?.data).toEqual(data);
    // The alternation is still readable: six highs and six lows, not one average.
    expect(new Set(read(outcome).series[0]?.data)).toEqual(new Set([300, 150]));
  });

  it("keeps series aligned on the same window", async () => {
    const { readStreams } = build([
      series("watts", Array.from({ length: 60 }, (_, i) => i)),
      series("heartrate", Array.from({ length: 60 }, (_, i) => 100 + i))
    ]);

    const outcome = await readStreams.execute({
      ...window,
      types: ["watts", "heartrate"],
      startIndex: 5,
      endIndex: 8
    });

    expect(read(outcome).series[0]?.data).toEqual([5, 6, 7]);
    expect(read(outcome).series[1]?.data).toEqual([105, 106, 107]);
  });

  it("drops Intervals' own bookkeeping from each series", async () => {
    const { readStreams } = build([
      series("watts", [1, 2, 3], { data2: [9], valueTypeIsArray: false })
    ]);

    const outcome = await readStreams.execute({ ...window, startIndex: 0, endIndex: 3 });

    expect(Object.keys(read(outcome).series[0] ?? {}).sort()).toEqual(["data", "type"]);
  });

  describe("never returns less than it says", () => {
    /**
     * The defect this replaced: `slice` clamps past the end of the data while the answer still
     * carried the requested `endIndex`. An agent would read a 200-sample window, see the bounds
     * it asked for, and conclude the effort ended where the recording did.
     */
    it("reports the end it actually reached, not the one asked for", async () => {
      const { readStreams } = build([series("watts", Array.from({ length: 120 }, (_, i) => i))]);

      const outcome = await readStreams.execute({ ...window, startIndex: 100, endIndex: 300 });

      const result = read(outcome);
      expect(result.endIndex).toBe(120);
      expect(result.series[0]?.data).toHaveLength(20);
    });

    // Series are index-aligned by contract, so the shortest one sets how far the window runs.
    it("cuts every series on the shortest, so indices keep meaning the same instant", async () => {
      const { readStreams } = build([
        series("watts", Array.from({ length: 100 }, (_, i) => i)),
        series("heartrate", Array.from({ length: 40 }, (_, i) => 100 + i))
      ]);

      const outcome = await readStreams.execute({
        ...window,
        types: ["watts", "heartrate"],
        startIndex: 30,
        endIndex: 80
      });

      const result = read(outcome);
      expect(result.endIndex).toBe(40);
      expect(result.series.map((stream) => stream.data.length)).toEqual([10, 10]);
    });

    /**
     * Previously the missing series was filtered out and the answer looked complete. An agent
     * asked to compare power against heart rate would have silently compared power to itself.
     */
    it("names a requested series that came back absent", async () => {
      const { readStreams } = build([series("watts", [1, 2, 3])]);

      const outcome = await readStreams.execute({
        ...window,
        types: ["watts", "heartrate"],
        startIndex: 0,
        endIndex: 3
      });

      expect(read(outcome).missingTypes).toEqual(["heartrate"]);
    });

    it("names a series Intervals flags as entirely empty rather than dropping it", async () => {
      const { readStreams } = build([
        series("watts", [1, 2, 3]),
        series("temp", [null, null, null], { allNull: true })
      ]);

      const outcome = await readStreams.execute({
        ...window,
        types: ["watts", "temp"],
        startIndex: 0,
        endIndex: 3
      });

      const result = read(outcome);
      expect(result.series.map((stream) => stream.type)).toEqual(["watts"]);
      expect(result.missingTypes).toEqual(["temp"]);
    });

    it("says nothing about missing series when none is missing", async () => {
      const { readStreams } = build([series("watts", [1, 2, 3])]);

      const outcome = await readStreams.execute({ ...window, startIndex: 0, endIndex: 3 });

      expect(read(outcome)).not.toHaveProperty("missingTypes");
    });
  });

  describe("refusals", () => {
    it("refuses an empty window", async () => {
      const { readStreams, getActivityStreams } = build([]);

      const outcome = await readStreams.execute({ ...window, startIndex: 30, endIndex: 30 });

      expect(outcome).toEqual({ status: "failed", reason: ReadStreamsFailure.EmptyWindow });
      expect(getActivityStreams).not.toHaveBeenCalled();
    });

    // Without this guard the cap divided by zero, and omitting `types` made Intervals return
    // every stream it had, which is the request this whole use-case exists to prevent.
    it("refuses a request that names no series", async () => {
      const { readStreams, getActivityStreams } = build([]);

      const outcome = await readStreams.execute({
        ...window,
        types: [],
        startIndex: 0,
        endIndex: 60
      });

      expect(outcome).toEqual({ status: "failed", reason: ReadStreamsFailure.NoTypes });
      expect(getActivityStreams).not.toHaveBeenCalled();
    });

    // Refused, never truncated: a silent truncation would have the agent reason about a partial
    // effort without knowing it.
    it("refuses a window over the cap, before calling the API, and says how wide it may be", async () => {
      const { readStreams, getActivityStreams } = build([]);

      const outcome = await readStreams.execute({
        ...window,
        types: ["watts", "heartrate", "cadence"],
        startIndex: 0,
        endIndex: 10_000
      });

      expect(outcome).toEqual({
        status: "failed",
        reason: ReadStreamsFailure.WindowTooLarge,
        suggestedSamples: Math.floor(MAX_STREAM_VALUES / 3)
      });
      expect(getActivityStreams).not.toHaveBeenCalled();
    });

    it("accepts a window exactly at the cap", async () => {
      const data = Array.from({ length: MAX_STREAM_VALUES }, () => 200);
      const { readStreams } = build([series("watts", data)]);

      const outcome = await readStreams.execute({
        ...window,
        startIndex: 0,
        endIndex: MAX_STREAM_VALUES
      });

      expect(outcome.status).toBe("read");
    });

    /**
     * Some streams are flagged `valueTypeIsArray` and each of their samples is itself an array,
     * so counting samples let a request sail past the cap by the factor of the nesting. The cap
     * is measured on what would actually be returned.
     */
    it("counts nested values, so an array-valued stream cannot slip past the cap", async () => {
      const samples = MAX_STREAM_VALUES / 2 + 1;
      const data = Array.from({ length: samples }, () => [1, 2]);
      const { readStreams } = build([series("latlng", data, { valueTypeIsArray: true })]);

      const outcome = await readStreams.execute({
        ...window,
        types: ["latlng"],
        startIndex: 0,
        endIndex: samples
      });

      expect(outcome).toEqual({
        status: "failed",
        reason: ReadStreamsFailure.WindowTooLarge,
        suggestedSamples: MAX_STREAM_VALUES
      });
    });

    it("reports when the activity has nothing for those series", async () => {
      const { readStreams } = build([]);

      const outcome = await readStreams.execute({ ...window, startIndex: 0, endIndex: 60 });

      expect(outcome).toEqual({ status: "failed", reason: ReadStreamsFailure.NoData });
    });

    // An empty slice dressed as a successful read is the worst of both worlds: it says the
    // window exists and holds nothing. Say how long the recording is instead.
    it("refuses a window starting past the end, and says how long the recording is", async () => {
      const { readStreams } = build([series("watts", Array.from({ length: 120 }, () => 200))]);

      const outcome = await readStreams.execute({ ...window, startIndex: 200, endIndex: 260 });

      expect(outcome).toEqual({
        status: "failed",
        reason: ReadStreamsFailure.NoData,
        availableSamples: 120
      });
    });
  });
});
