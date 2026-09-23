import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  COACHED_ACTIVITY_FIELDS,
  DEFAULT_READ_BOUNDS
} from "../../../domain/training";
import { toCoachedActivities, toCoachedActivity } from "../../mappers/project";
import { assertAthleteId, athleteIdShape, dateRangeShape, runAthleteTool, runTool, type ResolveClient } from "../result";
import {
  ReadStreamsFailure,
  type ReadActivityStreams,
  type ReadStreamsOutcome
} from "../../../use-cases/readActivityStreams";

/** ISO date (YYYY-MM-DD) for `days` ago, used as a default range start. */
export function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

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
        "List the athlete's activities over a date range, most recent first. Defaults to the " +
        "last 30 days and the 15 most recent. Each activity carries what a coach reasons " +
        "about: load, intensity, zone times, decoupling, felt effort, compliance with the " +
        "planned session. Ask for `fields` only if you need something outside that.",
      inputSchema: {
        ...athleteIdShape,
        ...dateRangeShape,
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`Maximum number of activities (default ${String(DEFAULT_READ_BOUNDS.activityLimit)}).`),
        fields: z
          .array(z.string())
          .optional()
          .describe(
            "Override the default field set, which is deliberately reduced. Name the Intervals.icu " +
              "fields you need if one is missing from a result."
          )
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) =>
        toCoachedActivities(
          await client.getActivities({
            oldest: args.oldest ?? isoDaysAgo(30),
            newest: args.newest,
            limit: args.limit ?? DEFAULT_READ_BOUNDS.activityLimit,
            fields: args.fields ?? COACHED_ACTIVITY_FIELDS
          })
        )
      )
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
      description: "Get the interval/lap breakdown (power, HR, pace per interval) for an activity.",
      inputSchema: {
        ...athleteIdShape,
        activityId: z.string().describe("Activity id, e.g. 'i1234567'.")
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, (client) => client.getActivityIntervals(args.activityId))
  );

  server.registerTool(
    "get_activity_streams",
    {
      title: "Get activity streams",
      description:
        "Read per-second sensor values over ONE window of an activity, at full resolution. Use " +
        "this to look inside an effort: whether an interval was held, how heart rate drifted. " +
        "To judge a whole session against its plan, use get_activity_intervals instead, which " +
        "already aggregates each repetition. Both the series and the window are required, and a " +
        "window too wide is refused rather than smoothed, so that short intervals stay visible.",
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
        startSeconds: z
          .number()
          .int()
          .min(0)
          .describe("Window start, in seconds from the beginning of the activity."),
        endSeconds: z
          .number()
          .int()
          .positive()
          .describe("Window end, in seconds from the beginning of the activity (exclusive).")
      }
    },
    (args) =>
      runTool(async () => {
        assertAthleteId(args.athleteId);
        const outcome = await readActivityStreams.execute({
          athleteId: args.athleteId,
          activityId: args.activityId,
          types: args.types,
          startSeconds: args.startSeconds,
          endSeconds: args.endSeconds
        });
        if (outcome.status === "failed") throw new Error(streamsFailureMessage(outcome));
        return outcome.window;
      })
  );
}

/** Each refusal phrased for the agent that reads it, with what to do next. */
function streamsFailureMessage(
  outcome: Extract<ReadStreamsOutcome, { status: "failed" }>
): string {
  switch (outcome.reason) {
    case ReadStreamsFailure.EmptyWindow:
      return "endSeconds must be greater than startSeconds.";
    case ReadStreamsFailure.WindowTooLarge:
      return (
        `Window too wide for ${String(outcome.suggestedSeconds)} seconds per series. Narrow it ` +
        `to the effort you are analysing, or ask for fewer series. The resolution is never ` +
        `reduced, so short intervals stay readable.`
      );
    case ReadStreamsFailure.NoData:
      return "This activity has no data for the requested series over that window.";
  }
}
