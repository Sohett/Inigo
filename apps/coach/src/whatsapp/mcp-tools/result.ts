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
  athleteId: z.string().describe("The Inigo athlete id — the `inigo_athlete_id` from the incoming message envelope.")
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Enforce the athlete id format here rather than in the tool's JSON Schema, so the regex stays
 * out of every request's context. A malformed id is a clean tool error, not an API error.
 */
export function assertAthleteId(athleteId: string): void {
  if (!UUID_PATTERN.test(athleteId)) {
    throw new Error(
      "Invalid athleteId: expected the `inigo_athlete_id` value from the message envelope."
    );
  }
}


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
