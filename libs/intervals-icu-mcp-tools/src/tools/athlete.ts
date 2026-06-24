import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsIcuClient } from "@inigo/intervals-icu-client";
import { runTool } from "../result";

export function registerAthleteTools(server: McpServer, client: IntervalsIcuClient): void {
  server.registerTool(
    "get_athlete_profile",
    {
      title: "Get athlete profile",
      description:
        "Get the athlete's profile: sport settings, FTP, threshold heart rate, training zones and personal details.",
      inputSchema: {}
    },
    () => runTool(() => client.getAthleteProfile())
  );
}
