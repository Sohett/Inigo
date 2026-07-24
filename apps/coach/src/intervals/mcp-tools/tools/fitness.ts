import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { athleteIdShape, dateRangeShape, runAthleteTool, type ResolveClient } from "../result";

export function registerFitnessTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "get_fitness",
    {
      title: "Get fitness (CTL/ATL/TSB)",
      description:
        "Get the fitness series over a date range: CTL (fitness), ATL (fatigue) and form/TSB (form = CTL - ATL) per day.",
      inputSchema: { ...athleteIdShape, ...dateRangeShape }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, (client) =>
        client.getFitness({ oldest: args.oldest, newest: args.newest })
      )
  );
}
