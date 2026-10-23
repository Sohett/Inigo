import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AthleteLinkDestination, type AthleteLinkOutcome, type CreateAthleteLink } from "../../../use-cases/createAthleteLink";
import { assertAthleteId, athleteIdShape, runTool } from "../result";

/**
 * `get_intervals_connect_link` (INI-69): the link an agent sends the athlete, the only way to
 * connect Intervals.icu (INI-72 removed the API key). Since INI-85, a magic link that signs the
 * athlete in and lands them on the connection page: one tool per action, the destination is ours.
 */
export function registerCredentialTools(server: McpServer, athleteLink: CreateAthleteLink): void {
  server.registerTool(
    "get_intervals_connect_link",
    {
      title: "Get the athlete's Intervals.icu connection link",
      description:
        "A personal link (valid 1 hour, single use) the athlete opens to connect Intervals.icu to " +
        "Inigo by OAuth, without any API key. Send it as is on WhatsApp, right away. Also the way " +
        "to reconnect an athlete whose access was lost or revoked. When the athlete is done, you " +
        "receive a turn with `evenement: intervals_connecte` and an empty message. " +
        "`oauth_unavailable` means the connection is not open on this deployment: tell the " +
        "athlete it is temporarily unavailable.",
      inputSchema: { ...athleteIdShape }
    },
    (args) =>
      runTool(async () => {
        assertAthleteId(args.athleteId);
        return toToolResult(await athleteLink.execute(args.athleteId, AthleteLinkDestination.IntervalsConnect));
      })
  );
}

/** The tool's contract with the agents' prompts predates INI-85: unavailable reads `oauth_unavailable`. */
function toToolResult(outcome: AthleteLinkOutcome) {
  switch (outcome.status) {
    case "unavailable":
      return { status: "oauth_unavailable" as const, reason: outcome.reason };
    case "link":
    case "unknown_athlete":
      return outcome;
  }
}
