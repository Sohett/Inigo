import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Result type returned by every Intervals.icu tool. */
export type ToolResult = CallToolResult;

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

/** Shared input fields for date-range filtered tools. */
export const dateRangeShape = {
  oldest: z.string().optional().describe("Inclusive start date in ISO format (YYYY-MM-DD)."),
  newest: z.string().optional().describe("Inclusive end date in ISO format (YYYY-MM-DD).")
} as const;
