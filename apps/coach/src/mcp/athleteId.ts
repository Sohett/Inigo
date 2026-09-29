/**
 * The athlete id every MCP tool takes, and the one place its format is enforced.
 *
 * All three servers (coaching-data, Intervals.icu, WhatsApp) expose a single static endpoint
 * shared by every athlete, because a Managed Agent configures one fixed MCP server URL. So the
 * athlete is identified per call rather than by the URL, and the agent reads the value off the
 * `inigo_athlete_id` line of the incoming message envelope.
 *
 * Shared rather than copied per server: this is the input-validation boundary of every tool on
 * all three, and three copies means three places to miss when the format changes.
 */
import { z } from "zod";

/**
 * Declared as a plain string on purpose. `z.uuid()` emits a 166-character regex into the JSON
 * Schema of every tool, which the model re-reads on every request for no benefit: it copies back
 * the id we handed it. The format is still enforced, server-side, by `assertAthleteId`.
 */
export const athleteIdShape = {
  athleteId: z
    .string()
    .describe("The Inigo athlete id — the `inigo_athlete_id` from the incoming message envelope.")
} as const;

/** A canonical UUID, the format of every id in Neon. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Enforce the athlete id format here rather than in the tool's JSON Schema, so the regex stays
 * out of every request's context. A malformed id is a clean tool error, not a database or API
 * error surfacing from three layers down.
 */
export function assertAthleteId(athleteId: string): void {
  if (!UUID_PATTERN.test(athleteId)) {
    throw new Error(
      "Invalid athleteId: expected the `inigo_athlete_id` value from the message envelope."
    );
  }
}
