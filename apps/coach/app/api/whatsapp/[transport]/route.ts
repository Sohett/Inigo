import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { registerWhatsappTools } from "../../../../src/whatsapp/mcp-tools";
import { createSendAthleteMessage } from "../../../../src/use-cases/sendAthleteMessage";
import { getDeps } from "../../../../src/deps";
import { verifyBearerToken } from "../../../../src/auth";

// MCP requests are dynamic and must never be statically cached.
export const dynamic = "force-dynamic";

// The third static MCP endpoint (/api/whatsapp/mcp), same shape as the other two. It exposes a
// single tool so the agent never carries the gateway session id nor a WhatsApp chat id: the
// `sendAthleteMessage` use-case resolves both, from Neon and from the environment.
const handler = createMcpHandler(
  (server) => {
    const { whatsapp, repo, whatsappGateway } = getDeps();
    const sendMessage = createSendAthleteMessage({
      repo,
      gateway: whatsappGateway,
      resolveClient: whatsapp
    });
    registerWhatsappTools(server, { sendMessage });
  },
  {
    serverInfo: { name: "whatsapp-mcp", version: "0.1.0" },
    capabilities: { tools: {} }
  },
  { basePath: "/api/whatsapp" }
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
