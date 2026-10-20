import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CreateIntervalsConnectLink } from "../../../use-cases/createIntervalsConnectLink";
import { assertAthleteId, athleteIdShape, runTool } from "../result";

/**
 * `get_intervals_connect_link` (INI-69): the OAuth link an agent sends the athlete, the only way
 * to connect Intervals.icu (INI-72 removed the API key).
 */
export function registerCredentialTools(server: McpServer, connectLink: CreateIntervalsConnectLink): void {
  server.registerTool(
    "get_intervals_connect_link",
    {
      title: "Get the athlete's Intervals.icu connection link",
      description:
        "A personal link (valid 72 hours) the athlete opens to connect Intervals.icu to Inigo " +
        "by OAuth, without any API key. Send it as is on WhatsApp. Also the way to reconnect an " +
        "athlete whose access was lost or revoked. When the athlete is done, you receive a turn " +
        "with `evenement: intervals_connecte` and an empty message. `oauth_unavailable` means the " +
        "connection is not open on this deployment: tell the athlete it is temporarily unavailable.",
      inputSchema: { ...athleteIdShape }
    },
    (args) =>
      runTool(async () => {
        assertAthleteId(args.athleteId);
        return connectLink.execute(args.athleteId);
      })
  );
}
