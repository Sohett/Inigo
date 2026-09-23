import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  AthleteDataRepository,
  ScopedAthleteDataRepository
} from "../repository/athleteDataRepository";

/** Result type returned by every athlete-data tool. */
export type ToolResult = CallToolResult;

/**
 * Shared input field carried by every tool: the athlete to act on. The endpoint is a
 * single static `/api/coaching-data/mcp` shared by all athletes (a Managed Agent configures one
 * fixed MCP server URL), so the athlete is identified per call — not by the URL. The agent gets
 * this value from the `inigo_athlete_id` line of the incoming message envelope.
 *
 * Declared as a plain string on purpose. `z.uuid()` emits a 166-character regex into the JSON
 * Schema of every tool, which the model re-reads on every request for no benefit: it copies the
 * id we handed it. The format is still enforced, server-side, by `runAthleteTool`.
 */
export const athleteIdShape = {
  athleteId: z
    .string()
    .describe("The Inigo athlete id — the `inigo_athlete_id` from the incoming message envelope.")
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Enforce the athlete id format here rather than in the tool's JSON Schema, so the regex stays
 * out of every request's context. A malformed id is a clean tool error, not a database error.
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

/**
 * Validate the athlete id, scope the store to that athlete, then run the tool body. Every
 * athlete-data tool goes through here, so the format check cannot be forgotten on a new one.
 */
export function runAthleteTool(
  store: AthleteDataRepository,
  athleteId: string,
  fn: (scoped: ScopedAthleteDataRepository) => Promise<unknown>
): Promise<ToolResult> {
  return runTool(async () => {
    assertAthleteId(athleteId);
    return fn(store.forAthlete(athleteId));
  });
}
