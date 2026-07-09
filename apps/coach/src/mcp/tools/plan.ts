import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ScopedAthleteDataStore } from "../store/athleteDataStore";
import { runTool } from "./result";

export function registerPlanTools(server: McpServer, store: ScopedAthleteDataStore): void {
  server.registerTool(
    "get_training_plan",
    {
      title: "Get current training plan",
      description:
        "Read the athlete's current macro training plan (the active plan if any, else the most " +
        "recent) with its ordered blocks/mesocycles and their weekly targets. The concrete, " +
        "gate-validated weekly sessions and the live calendar live on Intervals.icu.",
      inputSchema: {}
    },
    () => runTool(() => store.getTrainingPlan())
  );
}
