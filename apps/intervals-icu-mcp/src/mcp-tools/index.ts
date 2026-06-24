import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsIcuClient } from "../client";
import { registerAthleteTools } from "./tools/athlete";
import { registerActivityTools } from "./tools/activities";
import { registerWellnessTools } from "./tools/wellness";
import { registerFitnessTools } from "./tools/fitness";
import { registerCurveTools } from "./tools/curves";
import { registerGearTools } from "./tools/gear";
import { registerEventReadTools, registerEventWriteTools } from "./tools/events";

export interface RegisterToolsOptions {
  /** When true, register the event write tools (create/update/delete). */
  enableWriteTools: boolean;
}

/**
 * Register all Intervals.icu tools on the given MCP server. Read tools are
 * always registered; write tools only when explicitly enabled.
 */
export function registerIntervalsIcuTools(
  server: McpServer,
  client: IntervalsIcuClient,
  options: RegisterToolsOptions
): void {
  registerAthleteTools(server, client);
  registerActivityTools(server, client);
  registerWellnessTools(server, client);
  registerFitnessTools(server, client);
  registerCurveTools(server, client);
  registerGearTools(server, client);
  registerEventReadTools(server, client);

  if (options.enableWriteTools) {
    registerEventWriteTools(server, client);
  }
}

export { jsonResult, errorResult, runTool, type ToolResult } from "./result";
