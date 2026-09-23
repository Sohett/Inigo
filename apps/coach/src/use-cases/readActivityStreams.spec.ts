import { describe, it, expect, vi } from "vitest";
import {
  createReadActivityStreams,
  MAX_STREAM_VALUES,
  ReadStreamsFailure
} from "./readActivityStreams";
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

const window = { athleteId: ATHLETE_ID, activityId: ACTIVITY_ID, types: ["watts"] };

describe("readActivityStreams", () => {
  it("returns the requested window at full resolution", async () => {
    const data = Array.from({ length: 100 }, (_, index) => index);
    const { readStreams, getActivityStreams } = build([series("watts", data)]);

    const outcome = await readStreams.execute({ ...window, startSeconds: 10, endSeconds: 20 });

    expect(getActivityStreams).toHaveBeenCalledWith(ACTIVITY_ID, ["watts"]);
    expect(outcome).toEqual({
      status: "read",
      window: {
        activityId: ACTIVITY_ID,
        startSeconds: 10,
        endSeconds: 20,
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

    const outcome = await readStreams.execute({ ...window, startSeconds: 0, endSeconds: 270 });

    expect(outcome.status).toBe("read");
    const read = (outcome as { window: { series: { data: number[] }[] } }).window.series[0]!.data;
    expect(read).toEqual(data);
    // The alternation is still readable: six highs and six lows, not one average.
    expect(new Set(read)).toEqual(new Set([300, 150]));
  });

  it("keeps series aligned on the same window", async () => {
    const { readStreams } = build([
      series("watts", Array.from({ length: 60 }, (_, i) => i)),
      series("heartrate", Array.from({ length: 60 }, (_, i) => 100 + i))
    ]);

    const outcome = await readStreams.execute({
      ...window,
      types: ["watts", "heartrate"],
      startSeconds: 5,
      endSeconds: 8
    });

    const read = (outcome as { window: { series: { type: string; data: number[] }[] } }).window;
    expect(read.series[0]?.data).toEqual([5, 6, 7]);
    expect(read.series[1]?.data).toEqual([105, 106, 107]);
  });

  it("drops Intervals' own bookkeeping from each series", async () => {
    const { readStreams } = build([series("watts", [1, 2, 3], { data2: [9], valueTypeIsArray: false })]);

    const outcome = await readStreams.execute({ ...window, startSeconds: 0, endSeconds: 3 });

    const read = (outcome as unknown as { window: { series: Record<string, unknown>[] } }).window
      .series[0]!;
    expect(Object.keys(read).sort()).toEqual(["data", "type"]);
  });

  it("drops a stream Intervals flags as entirely empty", async () => {
    const { readStreams } = build([
      series("watts", [1, 2, 3]),
      series("temp", [null, null, null], { allNull: true })
    ]);

    const outcome = await readStreams.execute({
      ...window,
      types: ["watts", "temp"],
      startSeconds: 0,
      endSeconds: 3
    });

    const read = (outcome as { window: { series: { type: string }[] } }).window.series;
    expect(read.map((stream) => stream.type)).toEqual(["watts"]);
  });

  it("refuses an empty window", async () => {
    const { readStreams, getActivityStreams } = build([]);

    const outcome = await readStreams.execute({ ...window, startSeconds: 30, endSeconds: 30 });

    expect(outcome).toEqual({ status: "failed", reason: ReadStreamsFailure.EmptyWindow });
    expect(getActivityStreams).not.toHaveBeenCalled();
  });

  // Refused, never truncated: a silent truncation would have the agent reason about a partial
  // effort without knowing it.
  it("refuses a window over the cap, before calling the API, and says how wide it may be", async () => {
    const { readStreams, getActivityStreams } = build([]);

    const outcome = await readStreams.execute({
      ...window,
      types: ["watts", "heartrate", "cadence"],
      startSeconds: 0,
      endSeconds: 10_000
    });

    expect(outcome).toEqual({
      status: "failed",
      reason: ReadStreamsFailure.WindowTooLarge,
      suggestedSeconds: Math.floor(MAX_STREAM_VALUES / 3)
    });
    expect(getActivityStreams).not.toHaveBeenCalled();
  });

  it("accepts a window exactly at the cap", async () => {
    const data = Array.from({ length: MAX_STREAM_VALUES }, () => 200);
    const { readStreams } = build([series("watts", data)]);

    const outcome = await readStreams.execute({
      ...window,
      startSeconds: 0,
      endSeconds: MAX_STREAM_VALUES
    });

    expect(outcome.status).toBe("read");
  });

  it("reports when the activity has nothing for those series", async () => {
    const { readStreams } = build([]);

    const outcome = await readStreams.execute({ ...window, startSeconds: 0, endSeconds: 60 });

    expect(outcome).toEqual({ status: "failed", reason: ReadStreamsFailure.NoData });
  });
});
