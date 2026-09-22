import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AthleteRepository } from "../../repositories/athleteRepository";
import type { WhatsappGatewayRepository } from "../../repositories/whatsappGatewayRepository";
import type { ResolveOpenWaClient } from "../resolveClient";
import { athleteIdShape, runTool } from "./result";

export interface WhatsappToolDeps {
  /** Resolves the gateway client on call, so a missing credential stays local to this tool. */
  resolve: ResolveOpenWaClient;
  /** Reads the athlete's chat id, learned by the routing on the first inbound message. */
  repo: AthleteRepository;
  /** Reads the gateway session, which lives in Neon because re-pairing WhatsApp changes it. */
  gateway: WhatsappGatewayRepository;
}

/**
 * Register the WhatsApp tool on an MCP server.
 *
 * One tool, on purpose. The agent used to drive the OpenWA gateway's own MCP server, which
 * publishes 51 tools for the single one the coach calls, and which required the agent to carry
 * the gateway session id — an infrastructure identifier that has no business being in a model's
 * context, and that it could not resolve (INI-24). Here the agent names an athlete and a text;
 * the chat and the gateway session are resolved server-side.
 */
export function registerWhatsappTools(server: McpServer, deps: WhatsappToolDeps): void {
  server.registerTool(
    "send_whatsapp_message",
    {
      title: "Send a WhatsApp message",
      description:
        "Send a WhatsApp message to the athlete. This is the ONLY way to reach them: your own " +
        "text output is never delivered. The server resolves their chat and the gateway " +
        "session, so you pass just the athlete and the text.",
      inputSchema: {
        ...athleteIdShape,
        text: z
          .string()
          .min(1)
          .max(4096)
          .describe("Message body, plain text. WhatsApp rejects anything over 4096 characters.")
      }
    },
    (args) =>
      runTool(async () => {
        const athlete = await deps.repo.findById(args.athleteId);
        if (!athlete) throw new Error(`Unknown athlete ${args.athleteId}.`);
        if (!athlete.chatId) {
          throw new Error(
            `Athlete ${args.athleteId} has no known WhatsApp chat yet. The chat is learned from ` +
              `their first inbound message, so this athlete has to write first.`
          );
        }
        const sessionId = await deps.gateway.getSessionId();
        if (!sessionId) {
          throw new Error(
            "No WhatsApp gateway session is recorded. Set it from the coach admin; it changes " +
              "every time the WhatsApp session is re-paired."
          );
        }
        await deps.resolve().sendText(sessionId, athlete.chatId, args.text);
        return { sent: true };
      })
  );
}
