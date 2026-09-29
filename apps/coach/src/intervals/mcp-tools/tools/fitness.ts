import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DEFAULT_READ_BOUNDS, FITNESS_FIELDS } from "../../../domain/training";
import { toFitnessPoints } from "../../mappers/project";
import { isoDaysAgo } from "./dateRange";
import { athleteIdShape, dateRangeShape, runAthleteTool, type ResolveClient } from "../result";

export function registerFitnessTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "get_fitness",
    {
      title: "Get fitness (CTL/ATL/TSB)",
      description:
        `Get the fitness series over a date range: CTL (fitness), ATL (fatigue) and form/TSB ` +
        `(form = CTL - ATL) per day. Defaults to the last ` +
        `${String(DEFAULT_READ_BOUNDS.fitnessDays)} days, which is enough to read a trend.`,
      inputSchema: { ...athleteIdShape, ...dateRangeShape }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) =>
        // Without a default range Intervals returns one record per day since the athlete's very
        // first, and this is the read four of the five agents make.
        toFitnessPoints(
          await client.getWellness({
            oldest: args.oldest ?? isoDaysAgo(DEFAULT_READ_BOUNDS.fitnessDays),
            newest: args.newest,
            fields: FITNESS_FIELDS
          })
        )
      )
  );
}
