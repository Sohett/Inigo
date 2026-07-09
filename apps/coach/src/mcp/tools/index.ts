import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ScopedAthleteDataStore } from "../store/athleteDataStore";
import { registerProfileReadTools, registerProfileWriteTools } from "./profile";
import { registerThresholdTools } from "./thresholds";
import { registerGoalReadTools, registerGoalWriteTools } from "./goals";
import { registerPlanTools } from "./plan";
import { registerAdaptationLogReadTools, registerAdaptationLogWriteTools } from "./adaptationLog";

export interface RegisterToolsOptions {
  /** When true, register the write tools (update_profile, log_adaptation, upsert_goal). */
  enableWriteTools: boolean;
}

/**
 * Register all athlete-data tools on the given MCP server. The store is already scoped to
 * one athlete, so tools never take an athleteId. Read tools are always registered; write
 * tools only when explicitly enabled (least-privilege by default).
 */
export function registerAthleteDataTools(
  server: McpServer,
  store: ScopedAthleteDataStore,
  options: RegisterToolsOptions
): void {
  registerProfileReadTools(server, store);
  registerThresholdTools(server, store);
  registerGoalReadTools(server, store);
  registerPlanTools(server, store);
  registerAdaptationLogReadTools(server, store);

  if (options.enableWriteTools) {
    registerProfileWriteTools(server, store);
    registerGoalWriteTools(server, store);
    registerAdaptationLogWriteTools(server, store);
  }
}

export { jsonResult, errorResult, runTool, type ToolResult } from "./result";
