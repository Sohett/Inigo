import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { COACHED_ACTIVITY_FIELDS, DEFAULT_READ_BOUNDS } from "../../../domain/training";
import {
  toCoachedActivities,
  toCoachedActivity,
  toCoachedActivityIntervals
} from "../../mappers/project";
import {
  assertAthleteId,
  athleteIdShape,
  dateRangeShape,
  runAthleteTool,
  runTool,
  type ResolveClient
} from "../result";
import { isoDaysAgo } from "./dateRange";
import {
  ReadStreamsFailure,
  type ReadActivityStreams,
  type ReadStreamsOutcome
} from "../../../use-cases/readActivityStreams";

export function registerActivityTools(
  server: McpServer,
  resolve: ResolveClient,
  readActivityStreams: ReadActivityStreams
): void {
  server.registerTool(
    "get_activities",
    {
      title: "List activities",
      description:
        `List the athlete's activities over a date range, most recent first. Defaults to the ` +
        `last ${String(DEFAULT_READ_BOUNDS.activityDays)} days and the ` +
        `${String(DEFAULT_READ_BOUNDS.activityLimit)} most recent. Each activity carries what a ` +
        `coach reasons about: load, intensity, zone times, decoupling, felt effort, compliance ` +
        `with the planned session. Ask for \`fields\` only if you need something outside that.`,
      inputSchema: {
        ...athleteIdShape,
        ...dateRangeShape,
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            `Maximum number of activities (default ${String(DEFAULT_READ_BOUNDS.activityLimit)}).`
          ),
        fields: z
          .array(z.string())
          .min(1)
          .optional()
          .describe(
            "Override the default field set, which is deliberately reduced. Name the Intervals.icu " +
              "fields you need if one is missing from a result."
          )
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) => {
        // One list, used both as the query parameter and as the projection, so a field can never
        // be fetched and then thrown away, nor projected away after being asked for.
        const fields = args.fields ?? COACHED_ACTIVITY_FIELDS;
        return toCoachedActivities(
          await client.getActivities({
            oldest: args.oldest ?? isoDaysAgo(DEFAULT_READ_BOUNDS.activityDays),
            newest: args.newest,
            limit: args.limit ?? DEFAULT_READ_BOUNDS.activityLimit,
            fields
          }),
          fields
        );
      })
  );

  server.registerTool(
    "get_activity",
    {
      title: "Get activity details",
      description:
        "Get one activity: what a coach reasons about (load, intensity, zone times, decoupling, " +
        "felt effort, compliance with the planned session).",
      inputSchema: {
        ...athleteIdShape,
        activityId: z.string().describe("Activity id, e.g. 'i1234567'.")
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) =>
        toCoachedActivity(await client.getActivity(args.activityId))
      )
  );

  server.registerTool(
    "get_activity_intervals",
    {
      title: "Get activity intervals",
      description:
        "Get the interval breakdown of an activity: `groups` aggregates each set of repeated " +
        "intervals (was the 8x3min held?), `intervals` gives every repetition one by one (which " +
        "one faded?). This is the right tool to judge a session against its plan; the streams " +
        "are for looking inside a single effort.",
      inputSchema: {
        ...athleteIdShape,
        activityId: z.string().describe("Activity id, e.g. 'i1234567'.")
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) =>
        toCoachedActivityIntervals(await client.getActivityIntervals(args.activityId))
      )
  );

  server.registerTool(
    "get_activity_streams",
    {
      title: "Get activity streams",
      description:
        "Read raw sensor values over ONE window of an activity, at full resolution. Use this to " +
        "look inside an effort: whether an interval was held, how heart rate drifted. To judge a " +
        "whole session against its plan, use get_activity_intervals instead, which already " +
        "aggregates each repetition and is far cheaper. Bounds are SAMPLE INDICES, not seconds: " +
        "take them from the start_index / end_index of the interval you are looking into. Both " +
        "the series and the window are required, and a window too wide is refused rather than " +
        "smoothed, so that short intervals stay visible.",
      inputSchema: {
        ...athleteIdShape,
        activityId: z.string().describe("Activity id, e.g. 'i1234567'."),
        types: z
          .array(z.string())
          .min(1)
          .describe(
            "Sensor series to read, e.g. ['watts', 'heartrate']. Available: time, watts, " +
              "heartrate, cadence, velocity_smooth, altitude, distance, temp."
          ),
        startIndex: z
          .number()
          .int()
          .min(0)
          .describe("Window start, as a sample index (inclusive). Recording usually samples 1/s."),
        endIndex: z
          .number()
          .int()
          .positive()
          .describe("Window end, as a sample index (exclusive).")
      }
    },
    (args) =>
      runTool(async () => {
        assertAthleteId(args.athleteId);
        const outcome = await readActivityStreams.execute({
          athleteId: args.athleteId,
          activityId: args.activityId,
          types: args.types,
          startIndex: args.startIndex,
          endIndex: args.endIndex
        });
        if (outcome.status === "failed") throw new Error(streamsFailureMessage(outcome));
        return outcome.window;
      })
  );
}

/** Each refusal phrased for the agent that reads it, with what to do next. */
function streamsFailureMessage(outcome: Extract<ReadStreamsOutcome, { status: "failed" }>): string {
  switch (outcome.reason) {
    case ReadStreamsFailure.NoTypes:
      return "Name at least one sensor series in `types`.";
    case ReadStreamsFailure.EmptyWindow:
      return "endIndex must be greater than startIndex.";
    case ReadStreamsFailure.WindowTooLarge:
      return (
        `Window too wide: at most ${String(outcome.suggestedSamples)} samples per series for this ` +
        `many series. Narrow it to the effort you are analysing, or ask for fewer series. The ` +
        `resolution is never reduced, so short intervals stay readable.`
      );
    case ReadStreamsFailure.NoData:
      return outcome.availableSamples === undefined
        ? "This activity has no data for the requested series."
        : `startIndex is past the end of this recording, which holds ` +
          `${String(outcome.availableSamples)} samples for the requested series.`;
  }
}
