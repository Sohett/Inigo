import { z } from "zod";

/**
 * Environment schema for every Inigo service.
 *
 * Validated once at startup so that a misconfigured deployment fails fast and
 * loudly instead of producing confusing runtime errors deep inside a request.
 */
export const configSchema = z.object({
  /** Intervals.icu API key (used as the HTTP Basic password). Server-side only. */
  INTERVALS_API_KEY: z.string().min(1, "INTERVALS_API_KEY is required"),
  /** Intervals.icu athlete id, e.g. "i123456". */
  INTERVALS_ATHLETE_ID: z.string().min(1, "INTERVALS_ATHLETE_ID is required"),
  /** Bearer token the MCP client must present to reach this server. */
  MCP_BEARER_TOKEN: z
    .string()
    .min(16, "MCP_BEARER_TOKEN must be at least 16 characters"),
  /** When false, write tools (event create/update/delete) are not registered. */
  ENABLE_WRITE_TOOLS: z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  /** Base URL of the Intervals.icu API. */
  INTERVALS_BASE_URL: z.url().default("https://intervals.icu/api/v1")
});

export type Config = z.infer<typeof configSchema>;

/**
 * Parse and validate the given environment (defaults to `process.env`).
 * Throws an aggregated, human-readable error if anything is missing/invalid.
 * Never logs secret values.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
