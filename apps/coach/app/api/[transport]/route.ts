import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { registerAthleteDataTools } from "../../../src/mcp/tools";
import { getDeps } from "../../../src/deps";
import { verifyBearerToken } from "../../../src/auth";

// MCP requests are dynamic and must never be statically cached.
export const dynamic = "force-dynamic";

// A single static endpoint (/api/mcp) shared by all athletes: a Managed Agent configures one
// fixed MCP server URL, so the athlete cannot be a dynamic URL segment. Each tool takes an
// `athleteId` argument (fed by the `inigo_athlete_id` line coach injects into every message),
// and the store scopes the query to that athlete.
const handler = createMcpHandler(
  (server) => {
    const { athleteData } = getDeps();
    registerAthleteDataTools(server, athleteData);
  },
  {
    serverInfo: { name: "athlete-data-mcp", version: "0.1.0" },
    capabilities: { tools: {} }
  },
  { basePath: "/api" }
);

const authHandler = withMcpAuth(
  handler,
  async (_req, bearer): Promise<AuthInfo | undefined> => {
    if (!bearer) return undefined;
    const { config } = getDeps();
    if (!verifyBearerToken(bearer, config.MCP_BEARER_TOKEN)) return undefined;
    return { token: bearer, scopes: [], clientId: "managed-agent" };
  },
  { required: true }
);

export { authHandler as GET, authHandler as POST };
