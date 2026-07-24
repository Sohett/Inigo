import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { athleteIdShape, runAthleteTool, type ResolveClient } from "../result";

const curveInput = {
  ...athleteIdShape,
  type: z
    .string()
    .describe("Sport (required), e.g. Ride, Run, Swim, TrailRun, GravelRide, OpenWaterSwim."),
  newest: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
  curves: z
    .array(z.string())
    .optional()
    .describe('Durations to return, e.g. ["5s", "1m", "5m", "20m", "1h"]. Defaults to last year.')
};

export function registerCurveTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "get_power_curve",
    {
      title: "Get power curve",
      description:
        "Get the best-power curve (best average power per duration) for a sport, optionally up to a date.",
      inputSchema: curveInput
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, (client) =>
        client.getPowerCurve({ type: args.type, newest: args.newest, curves: args.curves })
      )
  );

  server.registerTool(
    "get_hr_curve",
    {
      title: "Get heart rate curve",
      description:
        "Get the best heart-rate curve (highest sustained HR per duration) for a sport, optionally up to a date.",
      inputSchema: curveInput
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, (client) =>
        client.getHrCurve({ type: args.type, newest: args.newest, curves: args.curves })
      )
  );

  server.registerTool(
    "get_pace_curve",
    {
      title: "Get pace curve",
      description:
        "Get the best-pace curve (fastest sustained pace per duration) for a sport, optionally up to a date.",
      inputSchema: curveInput
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, (client) =>
        client.getPaceCurve({ type: args.type, newest: args.newest, curves: args.curves })
      )
  );
}
