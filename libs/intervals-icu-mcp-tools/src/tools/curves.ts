import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsIcuClient } from "@inigo/intervals-icu-client";
import { z } from "zod";
import { runTool } from "../result";

const curveInput = {
  type: z
    .string()
    .describe("Sport (required), e.g. Ride, Run, Swim, TrailRun, GravelRide, OpenWaterSwim."),
  newest: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
  curves: z
    .array(z.string())
    .optional()
    .describe('Durations to return, e.g. ["5s", "1m", "5m", "20m", "1h"]. Defaults to last year.')
};

export function registerCurveTools(server: McpServer, client: IntervalsIcuClient): void {
  server.registerTool(
    "get_power_curve",
    {
      title: "Get power curve",
      description:
        "Get the best-power curve (best average power per duration) for a sport, optionally up to a date.",
      inputSchema: curveInput
    },
    (args) => runTool(() => client.getPowerCurve(args))
  );

  server.registerTool(
    "get_hr_curve",
    {
      title: "Get heart rate curve",
      description:
        "Get the best heart-rate curve (highest sustained HR per duration) for a sport, optionally up to a date.",
      inputSchema: curveInput
    },
    (args) => runTool(() => client.getHrCurve(args))
  );

  server.registerTool(
    "get_pace_curve",
    {
      title: "Get pace curve",
      description:
        "Get the best-pace curve (fastest sustained pace per duration) for a sport, optionally up to a date.",
      inputSchema: curveInput
    },
    (args) => runTool(() => client.getPaceCurve(args))
  );
}
