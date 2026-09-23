import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { athleteIdShape, runAthleteTool, type ResolveClient } from "../result";
import { toCurveSeriesList } from "../../mappers/project";

const curveInput = {
  ...athleteIdShape,
  type: z
    .string()
    .describe("Sport (required), e.g. Ride, Run, Swim, TrailRun, GravelRide, OpenWaterSwim."),
  newest: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
  curves: z
    .array(z.string())
    .optional()
    .describe(
      'PERIODS to compare, not effort durations: "1y", "2y", "42d" (last 42 days), "s0" ' +
        '(current season), "s1" (previous season), "all", or a range "r.2026-01-01.2026-03-31". ' +
        "Defaults to the last year. Every effort duration is returned within each period."
    )
};

export function registerCurveTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "get_power_curve",
    {
      title: "Get power curve",
      description:
        "Get the best-power curve for a sport: the best average power held over each duration, " +
        "plus watts per kilogram. Returns the curves only, not the activities behind them.",
      inputSchema: curveInput
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) =>
        toCurveSeriesList(
          await client.getPowerCurve({ type: args.type, newest: args.newest, curves: args.curves })
        )
      )
  );

  server.registerTool(
    "get_hr_curve",
    {
      title: "Get heart rate curve",
      description:
        "Get the best heart-rate curve for a sport: the highest heart rate sustained over each " +
        "duration. Returns the curves only, not the activities behind them.",
      inputSchema: curveInput
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) =>
        toCurveSeriesList(
          await client.getHrCurve({ type: args.type, newest: args.newest, curves: args.curves })
        )
      )
  );

  server.registerTool(
    "get_pace_curve",
    {
      title: "Get pace curve",
      description:
        "Get the best-pace curve for a sport: the fastest pace sustained over each distance. " +
        "Returns the curves only, not the activities behind them.",
      inputSchema: curveInput
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) =>
        toCurveSeriesList(
          await client.getPaceCurve({ type: args.type, newest: args.newest, curves: args.curves })
        )
      )
  );
}
