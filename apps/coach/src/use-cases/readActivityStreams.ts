import type { StreamSeries, StreamWindow } from "../domain/training";
import type { ResolveClient } from "../intervals/mcp-tools/result";

/**
 * How many sensor values one call may return, across all series.
 *
 * Sized on what a coach actually analyses: four series over a 25-minute block, or two over
 * fifty minutes, at one value per second. That is a work interval and its recovery, which is
 * the unit an analyst reasons about.
 *
 * The cap bounds the **window**, never the resolution. The constructor programs 30/15 Rønnestad
 * intervals (30 s at 106-115 % FTP, 15 s at ~50 %) and the analyst checks they were executed:
 * averaging into buckets coarser than a few seconds erases exactly what there was to verify.
 * So an over-large request is refused and the caller narrows it, rather than being silently
 * served something smoothed.
 */
export const MAX_STREAM_VALUES = 6000;

export const ReadStreamsFailure = {
  /** `endSeconds` is not after `startSeconds`. */
  EmptyWindow: "empty_window",
  /** The window times the number of series would exceed `MAX_STREAM_VALUES`. */
  WindowTooLarge: "window_too_large",
  /** Intervals returned nothing for these types on this activity. */
  NoData: "no_data"
} as const;

export type ReadStreamsFailure = (typeof ReadStreamsFailure)[keyof typeof ReadStreamsFailure];

export type ReadStreamsOutcome =
  | { status: "read"; window: StreamWindow }
  | { status: "failed"; reason: ReadStreamsFailure; suggestedSeconds?: number };

export interface ReadActivityStreamsInput {
  athleteId: string;
  activityId: string;
  /** Sensor series to read. Required: omitting it made Intervals return every stream. */
  types: string[];
  startSeconds: number;
  endSeconds: number;
}

export interface ReadActivityStreamsDeps {
  resolveClient: ResolveClient;
}

export interface ReadActivityStreams {
  execute(input: ReadActivityStreamsInput): Promise<ReadStreamsOutcome>;
}

/** Intervals' own bookkeeping on a stream; none of it helps a coach read the effort. */
function toSeries(raw: { type: string; data: unknown[] } & Record<string, unknown>): StreamSeries {
  return { type: raw.type, data: raw.data };
}

/**
 * Read one window of an activity's sensor streams, at full resolution.
 *
 * This is where the product rule lives: the caller names the series and the window, and a
 * request that would return more than `MAX_STREAM_VALUES` is **refused** rather than truncated.
 * A silent truncation is the worst outcome here, because the agent would reason about a partial
 * effort without knowing it.
 */
export function createReadActivityStreams(deps: ReadActivityStreamsDeps): ReadActivityStreams {
  return {
    async execute(input: ReadActivityStreamsInput): Promise<ReadStreamsOutcome> {
      const { startSeconds, endSeconds, types } = input;
      if (endSeconds <= startSeconds) {
        return { status: "failed", reason: ReadStreamsFailure.EmptyWindow };
      }

      const requested = (endSeconds - startSeconds) * types.length;
      if (requested > MAX_STREAM_VALUES) {
        return {
          status: "failed",
          reason: ReadStreamsFailure.WindowTooLarge,
          suggestedSeconds: Math.floor(MAX_STREAM_VALUES / types.length)
        };
      }

      const client = await deps.resolveClient(input.athleteId);
      const streams = await client.getActivityStreams(input.activityId, types);

      const series = streams
        // A stream Intervals flags as entirely empty carries no information, only length.
        .filter((stream) => stream.allNull !== true)
        .map((stream) => toSeries(stream as { type: string; data: unknown[] }))
        .map((stream) => ({ ...stream, data: stream.data.slice(startSeconds, endSeconds) }))
        .filter((stream) => stream.data.length > 0);

      if (series.length === 0) return { status: "failed", reason: ReadStreamsFailure.NoData };

      return {
        status: "read",
        window: { activityId: input.activityId, startSeconds, endSeconds, series }
      };
    }
  };
}
