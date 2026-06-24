import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsIcuClient } from "../../client";
import { dateRangeShape, runTool } from "../result";

export function registerWellnessTools(server: McpServer, client: IntervalsIcuClient): void {
  server.registerTool(
    "get_wellness",
    {
      title: "Get wellness data",
      description:
        "Get daily wellness records (resting HR, HRV, weight, sleep, plus CTL/ATL) over a date range.",
      inputSchema: { ...dateRangeShape }
    },
    (args) => runTool(() => client.getWellness(args))
  );
}
