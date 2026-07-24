import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { athleteIdShape, dateRangeShape, runAthleteTool, type ResolveClient } from "../result";

/** ISO date (YYYY-MM-DD) for `days` ago, used as a default range start. */
function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function registerActivityTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "get_activities",
    {
      title: "List activities",
      description:
        "List the athlete's activities for a date range (defaults to the last 30 days). Returns summary data (name, type, distance, training load) per activity.",
      inputSchema: {
        ...athleteIdShape,
        ...dateRangeShape,
        limit: z.number().int().positive().optional().describe("Maximum number of activities to return.")
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, (client) =>
        client.getActivities({
          oldest: args.oldest ?? isoDaysAgo(30),
          newest: args.newest,
          limit: args.limit
        })
      )
  );

  server.registerTool(
    "get_activity",
    {
      title: "Get activity details",
      description: "Get the full detail of a single activity by its id.",
      inputSchema: {
        ...athleteIdShape,
        activityId: z.string().describe("Activity id, e.g. 'i1234567'.")
      }
    },
    (args) => runAthleteTool(resolve, args.athleteId, (client) => client.getActivity(args.activityId))
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
        "Get raw per-second sensor streams (e.g. heartrate, watts, velocity_smooth, cadence) for an activity.",
      inputSchema: {
        ...athleteIdShape,
        activityId: z.string().describe("Activity id, e.g. 'i1234567'."),
        types: z
          .array(z.string())
          .optional()
          .describe("Stream types to fetch, e.g. ['heartrate', 'watts']. Omit for all.")
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, (client) =>
        client.getActivityStreams(args.activityId, args.types)
      )
  );
}
