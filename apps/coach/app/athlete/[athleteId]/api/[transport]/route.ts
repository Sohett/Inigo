import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { getDeps } from "../../../../../src/deps";
import { verifyBearerToken } from "../../../../../src/auth";
import { registerAthleteDataTools } from "../../../../../src/mcp/tools";

// MCP requests are dynamic and must never be statically cached.
export const dynamic = "force-dynamic";

const athleteIdSchema = z.uuid();

/**
 * Build the athlete-scoped MCP handler for one request. The athlete is bound by the URL
 * segment, so `mcp-handler`'s `basePath` must reflect that exact prefix (it matches the
 * endpoint as `${basePath}/mcp`). Tools receive a store already scoped to this athlete —
 * a session can only ever reach its own data. Bearer auth (global token) proves the
 * caller is the brain.
 */
function buildAuthHandler(athleteId: string): (req: Request) => Promise<Response> {
  const handler = createMcpHandler(
    (server) => {
      const { athleteData, config } = getDeps();
      registerAthleteDataTools(server, athleteData.forAthlete(athleteId), {
        enableWriteTools: config.ENABLE_WRITE_TOOLS
      });
    },
    {
      serverInfo: { name: "athlete-data-mcp", version: "0.1.0" },
      capabilities: { tools: {} }
    },
    { basePath: `/athlete/${athleteId}/api` }
  );

  return withMcpAuth(
    handler,
    async (_req, bearer): Promise<AuthInfo | undefined> => {
      if (!bearer) return undefined;
      const { config } = getDeps();
      if (!verifyBearerToken(bearer, config.MCP_BEARER_TOKEN)) return undefined;
      return { token: bearer, scopes: [], clientId: "managed-agent" };
    },
    { required: true }
  );
}

async function handle(
  request: Request,
  ctx: { params: Promise<{ athleteId: string; transport: string }> }
): Promise<Response> {
  const { athleteId } = await ctx.params;
  if (!athleteIdSchema.safeParse(athleteId).success) {
    return new Response(JSON.stringify({ error: "invalid_athlete_id" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
  return buildAuthHandler(athleteId)(request);
}

export { handle as GET, handle as POST };
