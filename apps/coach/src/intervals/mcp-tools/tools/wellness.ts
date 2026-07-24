import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { athleteIdShape, dateRangeShape, runAthleteTool, type ResolveClient } from "../result";

export function registerWellnessTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "get_wellness",
    {
      title: "Get wellness data",
      description:
        "Get daily wellness records (resting HR, HRV, weight, sleep, plus CTL/ATL) over a date range.",
      inputSchema: { ...athleteIdShape, ...dateRangeShape }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, (client) =>
        client.getWellness({ oldest: args.oldest, newest: args.newest })
      )
  );
}
