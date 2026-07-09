import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Result type returned by every athlete-data tool. */
export type ToolResult = CallToolResult;

/**
 * Shared input field carried by every tool: the athlete to act on. The endpoint is a
 * single static `/api/mcp` shared by all athletes (a Managed Agent configures one fixed
 * MCP server URL), so the athlete is identified per call — not by the URL. The agent gets
 * this value from the `inigo_athlete_id` line of the incoming message envelope.
 */
export const athleteIdShape = {
  athleteId: z
    .uuid()
    .describe(
      "The Inigo athlete id to act on — the `inigo_athlete_id` value from the incoming " +
        "message envelope. This is our internal athlete id, NOT the Intervals.icu athlete id."
    )
} as const;

/** Wrap arbitrary data as a pretty-printed JSON text result. */
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
