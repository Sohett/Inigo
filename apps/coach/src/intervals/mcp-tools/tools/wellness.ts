import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { athleteIdShape, dateRangeShape, runAthleteTool, type ResolveClient } from "../result";
import { DEFAULT_READ_BOUNDS, WELLNESS_DAY_FIELDS } from "../../../domain/training";
import { toWellnessDays } from "../../mappers/project";
import { isoDaysAgo } from "./activities";

export function registerWellnessTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "get_wellness",
    {
      title: "Get wellness data",
      description:
        "Get daily wellness records over a date range, defaulting to the last " +
        `${String(DEFAULT_READ_BOUNDS.wellnessDays)} days: form (CTL/ATL/ramp rate), recovery ` +
        "markers (resting HR, HRV, sleep) and what the athlete reported (soreness, fatigue, " +
        "stress, mood, readiness, injury).",
      inputSchema: { ...athleteIdShape, ...dateRangeShape }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) =>
        toWellnessDays(
          await client.getWellness({
            oldest: args.oldest ?? isoDaysAgo(DEFAULT_READ_BOUNDS.wellnessDays),
            newest: args.newest,
            fields: WELLNESS_DAY_FIELDS
          })
        )
      )
  );
}
