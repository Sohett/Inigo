import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SendMessageFailure,
  type SendAthleteMessage
} from "../../use-cases/sendAthleteMessage";
import { athleteIdShape, runTool } from "./result";

export interface WhatsappToolDeps {
  /** The use-case that owns the send. This layer only turns its outcome into a tool result. */
  sendMessage: SendAthleteMessage;
}

/** Each business outcome, phrased for the agent that reads it as a tool error. */
const FAILURE_MESSAGE: Record<SendMessageFailure, string> = {
  [SendMessageFailure.AthleteNotFound]: "Unknown athlete.",
  [SendMessageFailure.NoChatYet]:
    "This athlete has no known WhatsApp chat yet. The chat is learned from their first " +
    "inbound message, so they have to write first.",
  [SendMessageFailure.NoGatewaySession]:
    "No WhatsApp gateway session is recorded. Set it from the coach admin; it changes every " +
    "time the WhatsApp session is re-paired."
};

/**
 * Register the WhatsApp tool on an MCP server.
 *
 * One tool, on purpose. The agent used to drive the OpenWA gateway's own MCP server, which
 * publishes 51 tools for the single one the coach calls, and which required the agent to carry
 * the gateway session id — an infrastructure identifier that has no business being in a model's
 * context, and that it could not resolve (INI-24). Here the agent names an athlete and a text.
 *
 * Nothing is decided here: the send lives in `sendAthleteMessage`, and this layer only maps its
 * outcome onto the MCP result shape, the same way a route maps one onto HTTP.
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
        const outcome = await deps.sendMessage.execute(args.athleteId, args.text);
        if (outcome.status === "failed") throw new Error(FAILURE_MESSAGE[outcome.reason]);
        return { sent: true };
      })
  );
}
