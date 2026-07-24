import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { registerIntervalsIcuTools } from "../../../../src/intervals/mcp-tools";
import { getDeps } from "../../../../src/deps";
import { verifyBearerToken } from "../../../../src/auth";

// MCP requests are dynamic and must never be statically cached.
export const dynamic = "force-dynamic";

// A second static MCP endpoint (/api/intervals/mcp), distinct from the athlete-data one
// (/api/mcp) so the brain keeps its `intervals-icu` server name and per-agent read/write
// toolset allowlists unchanged. Each tool takes an `athleteId` argument (the same
// `inigo_athlete_id` coach injects into every message); the resolver fetches + decrypts that
// athlete's Intervals.icu key from Neon at request time, so the secret never reaches the LLM.
const handler = createMcpHandler(
  (server) => {
    const { intervalsResolver } = getDeps();
    registerIntervalsIcuTools(server, intervalsResolver);
  },
  {
    serverInfo: { name: "intervals-icu-mcp", version: "0.1.0" },
    capabilities: { tools: {} }
  },
  { basePath: "/api/intervals" }
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
