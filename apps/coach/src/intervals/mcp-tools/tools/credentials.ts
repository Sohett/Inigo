import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConnectIntervals } from "../../../use-cases/connectIntervals";
import { assertAthleteId, athleteIdShape, runTool } from "../result";

/** An Intervals.icu athlete id, `i123456`; a bare number gets its `i` back. */
const intervalsAthleteIdShape = z
  .string()
  .trim()
  .regex(/^i?\d+$/, "an Intervals.icu athlete id looks like i123456")
  .transform((id) => (id.startsWith("i") ? id : `i${id}`));

/**
 * `connect_intervals`: the onboarding agent registers the key and athlete id the athlete gave
 * it (INI-50, transitional until OAuth). The decision lives in `connectIntervals`; this only
 * validates the input and never echoes the key back.
 */
export function registerCredentialTools(server: McpServer, connectIntervals: ConnectIntervals): void {
  server.registerTool(
    "connect_intervals",
    {
      title: "Connect the athlete's Intervals.icu account",
      description:
        "Register the athlete's Intervals.icu API key and athlete id, after checking them " +
        "against Intervals.icu. Nothing is stored if they are refused; the reason says what to " +
        "ask the athlete. Once connected, the other Intervals.icu tools work for this athlete.",
      inputSchema: {
        ...athleteIdShape,
        apiKey: z.string().trim().min(8).max(200).describe("The API key, as the athlete pasted it."),
        intervalsAthleteId: intervalsAthleteIdShape.describe(
          "The Intervals.icu athlete id shown next to the key, e.g. i123456."
        )
      }
    },
    (args) =>
      runTool(async () => {
        assertAthleteId(args.athleteId);
        return connectIntervals.execute(args.athleteId, args.apiKey, args.intervalsAthleteId);
      })
  );
}
