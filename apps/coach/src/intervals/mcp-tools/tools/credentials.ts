import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConnectIntervals } from "../../../use-cases/connectIntervals";
import type { CreateIntervalsConnectLink } from "../../../use-cases/createIntervalsConnectLink";
import { assertAthleteId, athleteIdShape, runTool } from "../result";

/** An Intervals.icu athlete id, `i123456`; a capital `I` (phone keyboards) or a bare number is mended. */
const intervalsAthleteIdShape = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^i?\d+$/, "an Intervals.icu athlete id looks like i123456")
  .transform((id) => (id.startsWith("i") ? id : `i${id}`));

/**
 * `get_intervals_connect_link` (INI-69): the OAuth link the onboarding agent sends the athlete.
 * `connect_intervals`: the onboarding agent registers the key and athlete id the athlete gave
 * it (INI-50, the fallback while OAuth is not set up, removed by INI-72). The decision lives in `connectIntervals`; this only
 * validates the input and never echoes the key back.
 */
export function registerCredentialTools(
  server: McpServer,
  connectIntervals: ConnectIntervals,
  connectLink: CreateIntervalsConnectLink
): void {
  server.registerTool(
    "get_intervals_connect_link",
    {
      title: "Get the athlete's Intervals.icu connection link",
      description:
        "A personal link (valid 72 hours) the athlete opens to connect Intervals.icu to Inigo " +
        "by OAuth, without any API key. Send it as is on WhatsApp. Also the way to reconnect an " +
        "athlete whose access was lost or revoked. When an athlete in onboarding is done, you " +
        "receive a turn with `evenement: intervals_connecte`. `oauth_unavailable` means OAuth " +
        "is not set up yet: fall back to the API key (connect_intervals) if you have that tool.",
      inputSchema: { ...athleteIdShape }
    },
    (args) =>
      runTool(async () => {
        assertAthleteId(args.athleteId);
        return connectLink.execute(args.athleteId);
      })
  );

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
