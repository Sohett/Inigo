import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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
 * Shared input field carried by every tool: the athlete to act on. Same `athleteId` the agent
 * passes to the athlete-data MCP — the `inigo_athlete_id` from the message envelope, our
 * internal id (NOT the Intervals.icu athlete id, which the server resolves from it).
 */
export const athleteIdShape = {
  athleteId: z
    .uuid()
    .describe(
      "The Inigo athlete id to act on — the `inigo_athlete_id` value from the incoming " +
        "message envelope. Our internal id; the server resolves this athlete's Intervals.icu " +
        "API key and athlete id from it. NOT the Intervals.icu athlete id."
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
  return runTool(async () => fn(await resolve(athleteId)));
}

/** Shared input fields for date-range filtered tools. */
export const dateRangeShape = {
  oldest: z.string().optional().describe("Inclusive start date in ISO format (YYYY-MM-DD)."),
  newest: z.string().optional().describe("Inclusive end date in ISO format (YYYY-MM-DD).")
} as const;
