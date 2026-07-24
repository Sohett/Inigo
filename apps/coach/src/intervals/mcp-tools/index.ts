import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ResolveClient } from "./result";
import { registerAthleteTools, registerAthleteWriteTools } from "./tools/athlete";
import { registerActivityTools } from "./tools/activities";
import { registerWellnessTools } from "./tools/wellness";
import { registerFitnessTools } from "./tools/fitness";
import { registerCurveTools } from "./tools/curves";
import { registerGearTools } from "./tools/gear";
import { registerEventReadTools, registerEventWriteTools } from "./tools/events";

/**
 * Register all Intervals.icu tools on the given MCP server. Every tool takes an `athleteId`
 * argument (the endpoint is a single static server shared by all athletes) and resolves a
 * per-request client whose credential is fetched + decrypted from Neon for that athlete.
 * Access is bounded by the MCP bearer and, per agent, by the Managed Agent toolset allowlists —
 * so reads and writes are both always registered here.
 */
export function registerIntervalsIcuTools(server: McpServer, resolve: ResolveClient): void {
  registerAthleteTools(server, resolve);
  registerActivityTools(server, resolve);
  registerWellnessTools(server, resolve);
  registerFitnessTools(server, resolve);
  registerCurveTools(server, resolve);
  registerGearTools(server, resolve);
  registerEventReadTools(server, resolve);

  registerAthleteWriteTools(server, resolve);
  registerEventWriteTools(server, resolve);
}

export { jsonResult, errorResult, runTool, type ToolResult } from "./result";
