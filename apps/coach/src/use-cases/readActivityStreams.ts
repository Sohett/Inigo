import type { StreamSeries, StreamWindow } from "../domain/training";
import type { ResolveClient } from "../intervals/mcp-tools/result";

/**
 * How many sensor values one call may return, across all series.
 *
 * Sized on what a coach actually analyses: four series over a 25-minute block, or two over
 * fifty minutes, at one sample per second. That is a work interval and its recovery, which is
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
  /** No series was named. Omitting them made Intervals return every stream it had. */
  NoTypes: "no_types",
  /** `endIndex` is not after `startIndex`. */
  EmptyWindow: "empty_window",
  /** The window would return more than `MAX_STREAM_VALUES` values. */
  WindowTooLarge: "window_too_large",
  /** Intervals returned nothing usable for these types, or the window starts past the end. */
  NoData: "no_data"
} as const;

export type ReadStreamsFailure = (typeof ReadStreamsFailure)[keyof typeof ReadStreamsFailure];

export type ReadStreamsOutcome =
  | { status: "read"; window: StreamWindow }
  | {
      status: "failed";
      reason: ReadStreamsFailure;
      /** On `window_too_large`: how many samples wide the window may be, for these series. */
      suggestedSamples?: number;
      /** On `no_data`: how many samples the activity actually holds, when it holds any. */
      availableSamples?: number;
    };

export interface ReadActivityStreamsInput {
  athleteId: string;
  activityId: string;
  /** Sensor series to read. Required: omitting it made Intervals return every stream. */
  types: string[];
  /** Inclusive start, as a sample index. */
  startIndex: number;
  /** Exclusive end, as a sample index. */
  endIndex: number;
}

export interface ReadActivityStreamsDeps {
  resolveClient: ResolveClient;
}

export interface ReadActivityStreams {
  execute(input: ReadActivityStreamsInput): Promise<ReadStreamsOutcome>;
}

type RawStream = { type: string; data: unknown[] } & Record<string, unknown>;

/**
 * How many values a slice of samples really carries.
 *
 * Usually one per sample, but Intervals flags some streams `valueTypeIsArray` and each of their
 * samples is itself an array (a lat/lng pair, for instance). Counting samples there would let a
 * request sail past the cap by a factor of the nesting, which is the one thing the cap exists to
 * prevent, so the nested lengths are counted for real.
 */
function countValues(data: unknown[]): number {
  let total = 0;
  for (const sample of data) total += Array.isArray(sample) ? sample.length : 1;
  return total;
}

/** Intervals' own bookkeeping on a stream; none of it helps a coach read the effort. */
function toSeries(raw: RawStream, startIndex: number, endIndex: number): StreamSeries {
  return { type: raw.type, data: raw.data.slice(startIndex, endIndex) };
}

/**
 * Read one window of an activity's sensor streams, at full resolution.
 *
 * This is where the product rule lives, and it is a single promise: **what comes back is exactly
 * what the window says, or the call fails**. Never a smoothed version, never a shorter slice
 * wearing the requested bounds, never a series quietly absent from the answer. An agent that
 * reasons about a partial effort without knowing it is worse off than one that was refused.
 */
export function createReadActivityStreams(deps: ReadActivityStreamsDeps): ReadActivityStreams {
  return {
    async execute(input: ReadActivityStreamsInput): Promise<ReadStreamsOutcome> {
      const { startIndex, endIndex, types } = input;
      if (types.length === 0) return { status: "failed", reason: ReadStreamsFailure.NoTypes };
      if (endIndex <= startIndex) {
        return { status: "failed", reason: ReadStreamsFailure.EmptyWindow };
      }

      // Cheap pre-flight on the requested shape, so an obviously oversized window never reaches
      // the API. It assumes one value per sample; the binding check below measures the truth.
      if ((endIndex - startIndex) * types.length > MAX_STREAM_VALUES) {
        return {
          status: "failed",
          reason: ReadStreamsFailure.WindowTooLarge,
          suggestedSamples: Math.floor(MAX_STREAM_VALUES / types.length)
        };
      }

      const client = await deps.resolveClient(input.athleteId);
      const streams = (await client.getActivityStreams(input.activityId, types)) as RawStream[];

      // A stream Intervals flags as entirely empty carries no information, only length.
      const usable = streams.filter(
        (stream) => stream["allNull"] !== true && Array.isArray(stream.data) && stream.data.length > 0
      );
      if (usable.length === 0) return { status: "failed", reason: ReadStreamsFailure.NoData };

      // Every series is cut on the same bounds, so they stay index-aligned: reading watts at i
      // and heart rate at i must mean the same instant. The shortest series therefore sets how
      // far the window can actually run.
      const available = Math.min(...usable.map((stream) => stream.data.length));
      if (startIndex >= available) {
        return { status: "failed", reason: ReadStreamsFailure.NoData, availableSamples: available };
      }
      const resolvedEnd = Math.min(endIndex, available);

      const series = usable.map((stream) => toSeries(stream, startIndex, resolvedEnd));

      // The binding cap, measured on what would actually be returned rather than on what was
      // asked for. Refused, not truncated: a truncation is the silent partial this use-case
      // exists to make impossible.
      const samples = resolvedEnd - startIndex;
      const returned = series.reduce((total, stream) => total + countValues(stream.data), 0);
      if (returned > MAX_STREAM_VALUES) {
        // Suggest from the density actually observed, not from one value per sample. An
        // array-valued stream carries several values per sample, so the naive figure would be
        // refused again on the retry and cost another round-trip to say the same thing.
        const perSample = returned / samples;
        return {
          status: "failed",
          reason: ReadStreamsFailure.WindowTooLarge,
          suggestedSamples: Math.floor(MAX_STREAM_VALUES / perSample)
        };
      }

      // A sensor that was asked for and is not in the answer is named, never dropped: an agent
      // can only re-plan around a missing series if it knows which one it is missing.
      const returnedTypes = new Set(series.map((stream) => stream.type));
      const missingTypes = types.filter((type) => !returnedTypes.has(type));

      return {
        status: "read",
        window: {
          activityId: input.activityId,
          startIndex,
          endIndex: resolvedEnd,
          series,
          ...(missingTypes.length > 0 ? { missingTypes } : {})
        }
      };
    }
  };
}
