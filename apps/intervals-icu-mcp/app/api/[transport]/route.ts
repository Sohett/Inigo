import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { registerIntervalsIcuTools } from "../../../src/mcp-tools";
import { getDeps } from "../../../src/deps";
import { verifyBearerToken } from "../../../src/auth";

// MCP requests are dynamic and must never be statically cached.
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  (server) => {
    const { client, config } = getDeps();
    registerIntervalsIcuTools(server, client, {
      enableWriteTools: config.ENABLE_WRITE_TOOLS
    });
  },
  {
    serverInfo: { name: "intervals-icu-mcp", version: "0.1.0" },
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
