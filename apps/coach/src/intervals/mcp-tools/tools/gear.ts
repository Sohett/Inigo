import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { athleteIdShape, runAthleteTool, type ResolveClient } from "../result";

export function registerGearTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "get_gear",
    {
      title: "List gear",
      description: "List the athlete's gear (bikes, shoes) with accumulated distance.",
      inputSchema: { ...athleteIdShape }
    },
    (args) => runAthleteTool(resolve, args.athleteId, (client) => client.getGear())
  );
}
