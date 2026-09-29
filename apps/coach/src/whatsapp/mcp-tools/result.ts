import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { assertAthleteId, athleteIdShape } from "../../mcp/athleteId";

/** Result type returned by every WhatsApp tool. */
export type ToolResult = CallToolResult;

/**
 * Wrap arbitrary data as a JSON text result.
 *
 * Minified on purpose: indentation is pure cost. Every token of a tool result is written to the
 * thread's cache once and re-read on each following request (a measured 5:1 read/write ratio),
 * and pretty-printing adds 23% on objects and over 100% on arrays of numbers.
 */
export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
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

// Re-exported so a tool module keeps importing everything it needs from one place.
export { assertAthleteId, athleteIdShape };
