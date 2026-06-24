import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsIcuClient } from "@inigo/intervals-icu-client";
import { dateRangeShape, runTool } from "../result";

export function registerFitnessTools(server: McpServer, client: IntervalsIcuClient): void {
  server.registerTool(
    "get_fitness",
    {
      title: "Get fitness (CTL/ATL/TSB)",
      description:
        "Get the fitness series over a date range: CTL (fitness), ATL (fatigue) and form/TSB (form = CTL - ATL) per day.",
      inputSchema: { ...dateRangeShape }
    },
    (args) => runTool(() => client.getFitness(args))
  );
}
