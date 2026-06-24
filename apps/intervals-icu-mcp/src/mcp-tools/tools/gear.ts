import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsIcuClient } from "../../client";
import { runTool } from "../result";

export function registerGearTools(server: McpServer, client: IntervalsIcuClient): void {
  server.registerTool(
    "get_gear",
    {
      title: "List gear",
      description: "List the athlete's gear (bikes, shoes) with accumulated distance.",
      inputSchema: {}
    },
    () => runTool(() => client.getGear())
  );
}
