import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { assertAthleteId, athleteIdShape } from "../../mcp/athleteId";
import type { IntervalsIcuClient } from "../client";

/** Result type returned by every Intervals.icu tool. */
export type ToolResult = CallToolResult;

/**
 * Resolve the per-athlete Intervals.icu client. The endpoint is a single static
 * `/api/intervals/mcp` shared by all athletes, so the athlete is identified per call and its
 * API key is fetched + decrypted from Neon on demand (see `createIntervalsResolver`).
 */
export type ResolveClient = (athleteId: string) => Promise<IntervalsIcuClient>;

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

/**
 * Resolve the athlete's Intervals.icu client, then run the tool body against it. A missing
 * credential makes `resolve` throw, which `runTool` turns into a clean error result (never
 * leaking the key).
 */
export function runAthleteTool(
  resolve: ResolveClient,
  athleteId: string,
  fn: (client: IntervalsIcuClient) => Promise<unknown>
): Promise<ToolResult> {
  return runTool(async () => {
    assertAthleteId(athleteId);
    return fn(await resolve(athleteId));
  });
}

/** Shared input fields for date-range filtered tools. */
export const dateRangeShape = {
  oldest: z.string().optional().describe("Inclusive start date in ISO format (YYYY-MM-DD)."),
  newest: z.string().optional().describe("Inclusive end date in ISO format (YYYY-MM-DD).")
} as const;

// Re-exported so a tool module keeps importing everything it needs from one place.
export { assertAthleteId, athleteIdShape };
