import { z } from "zod";

/**
 * Environment schema for the Inigo coach backend.
 *
 * Validated once at startup so a misconfigured deployment fails fast and loudly.
 * Never logs secret values. Deliberately minimal: the WhatsApp reply path is
 * MCP-native (the agent sends via its OpenWA MCP tool), so this service only
 * needs to append inbound messages to a fixed managed-agent session.
 */
export const configSchema = z.object({
  /** Anthropic API key. Server-side only. */
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  /**
   * Id of the pre-created managed-agent session inbound messages are appended to
   * (single-user MVP: one fixed session = the conversation's memory).
   */
  ANTHROPIC_SESSION_ID: z.string().min(1, "ANTHROPIC_SESSION_ID is required"),
  /**
   * Optional shared secret to verify the OpenWA `X-OpenWA-Signature` webhook HMAC.
   * When unset, signature verification is skipped (MVP relies on a non-guessable
   * URL + the gateway's Sender filter).
   */
  WHATSAPP_WEBHOOK_SECRET: z.string().min(16).optional()
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
