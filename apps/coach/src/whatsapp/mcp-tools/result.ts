import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Result type returned by every WhatsApp tool. */
export type ToolResult = CallToolResult;

/**
 * Shared input field: the athlete to message. Same `athleteId` the agent passes to the
 * coaching-data and Intervals MCPs — the `inigo_athlete_id` from the message envelope.
 * The chat to reply to is resolved from it server-side, so the agent never carries a
 * WhatsApp chat id or a gateway session id.
 */
export const athleteIdShape = {
  athleteId: z
    .uuid()
    .describe("The Inigo athlete id — the `inigo_athlete_id` from the incoming message envelope.")
} as const;

/** Wrap arbitrary data as a JSON text result. */
export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Wrap an error as an MCP error result, never leaking secrets. */
export function errorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Run a tool implementation, converting success/failure into a ToolResult. */
export async function runTool(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return jsonResult(await fn());
  } catch (error) {
    return errorResult(error);
  }
}
