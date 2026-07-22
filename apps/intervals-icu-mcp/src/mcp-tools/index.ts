import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsIcuClient } from "../client";
import { registerAthleteTools, registerAthleteWriteTools } from "./tools/athlete";
import { registerActivityTools } from "./tools/activities";
import { registerWellnessTools } from "./tools/wellness";
import { registerFitnessTools } from "./tools/fitness";
import { registerCurveTools } from "./tools/curves";
import { registerGearTools } from "./tools/gear";
import { registerEventReadTools, registerEventWriteTools } from "./tools/events";

/**
 * Register all Intervals.icu tools on the given MCP server. Access is bounded by the
 * MCP bearer and, per agent, by the Managed Agent toolset allowlists — so reads and
 * writes are both always registered here.
 */
export function registerIntervalsIcuTools(server: McpServer, client: IntervalsIcuClient): void {
  registerAthleteTools(server, client);
  registerActivityTools(server, client);
  registerWellnessTools(server, client);
  registerFitnessTools(server, client);
  registerCurveTools(server, client);
  registerGearTools(server, client);
  registerEventReadTools(server, client);

  registerAthleteWriteTools(server, client);
  registerEventWriteTools(server, client);
}

export { jsonResult, errorResult, runTool, type ToolResult } from "./result";
