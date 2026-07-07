import { z } from "zod";

/**
 * Environment schema for the brain ops toolkit (@inigo/brain).
 *
 * Validated once when a bin starts so a misconfigured run fails fast and loudly.
 * Never logs secret values.
 */
export const configSchema = z.object({
  /** Anthropic API key for the workspace that hosts the brain. Server-side only. */
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  /**
   * Optional default agent to operate on (brain:pull, brain:agent:apply).
   * When unset, brain:pull snapshots every agent in the workspace.
   */
  BRAIN_AGENT_ID: z.string().min(1).optional(),
  /**
   * Neon connection string. Optional here (only the seed writes to the DB); the
   * seed bin requires it explicitly before any write. Never logged.
   */
  DATABASE_URL: z.string().min(1).optional()
});

export type BrainConfig = z.infer<typeof configSchema>;

/**
 * Parse and validate the given environment (defaults to `process.env`).
 * Throws an aggregated, human-readable error if anything is missing/invalid.
 * Never logs secret values.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): BrainConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
