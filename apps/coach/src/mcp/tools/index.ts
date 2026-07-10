import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AthleteDataStore } from "../store/athleteDataStore";
import { registerProfileReadTools, registerProfileWriteTools } from "./profile";
import { registerThresholdTools } from "./thresholds";
import { registerGoalReadTools, registerGoalWriteTools } from "./goals";
import { registerPlanTools, registerPlanWriteTools } from "./plan";
import { registerAdaptationLogReadTools, registerAdaptationLogWriteTools } from "./adaptationLog";

/**
 * Register all athlete-data tools on the given MCP server. Every tool takes an `athleteId`
 * argument (the endpoint is a single static server shared by all athletes) and scopes its
 * query with `store.forAthlete(athleteId)`. Reads and writes are both always registered:
 * every write is scoped to its athlete and the whole endpoint is gated by the MCP bearer,
 * which is the access boundary.
 */
export function registerAthleteDataTools(server: McpServer, store: AthleteDataStore): void {
  registerProfileReadTools(server, store);
  registerThresholdTools(server, store);
  registerGoalReadTools(server, store);
  registerPlanTools(server, store);
  registerAdaptationLogReadTools(server, store);

  registerProfileWriteTools(server, store);
  registerGoalWriteTools(server, store);
  registerAdaptationLogWriteTools(server, store);
  registerPlanWriteTools(server, store);
}

export { jsonResult, errorResult, runTool, type ToolResult } from "./result";
