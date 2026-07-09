import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ScopedAthleteDataStore } from "../store/athleteDataStore";
import { runTool } from "./result";

export function registerThresholdTools(server: McpServer, store: ScopedAthleteDataStore): void {
  server.registerTool(
    "get_thresholds",
    {
      title: "Get current training thresholds",
      description:
        "Read the athlete's current training thresholds — the latest historised value per sport " +
        "(FTP watts, threshold HR, max HR, threshold pace, power/HR zones, source, effective date). " +
        "This is the coaching reference used for planning; Intervals.icu holds the value used to " +
        "compute activity metrics.",
      inputSchema: {
        sport: z
          .enum(["bike", "run", "swim"])
          .optional()
          .describe("Filter to one sport. Omit to get the latest thresholds for every sport.")
      }
    },
    (args) => runTool(() => store.getThresholds(args.sport))
  );
}
