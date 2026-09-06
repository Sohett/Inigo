import { z } from "zod";

/**
 * Environment schema for the Inigo coach backend.
 *
 * Validated once at startup so a misconfigured deployment fails fast and loudly.
 * Never logs secret values. Deliberately minimal: the WhatsApp reply path is
 * MCP-native (the agent sends via its OpenWA MCP tool), so this service only
 * needs to append each inbound message to the session resolved for its athlete
 * (by `phone_num`, in Neon — no fixed session env var).
 */
export const configSchema = z.object({
  /** Anthropic API key. Server-side only. */
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  /**
   * Optional shared secret to verify the OpenWA `X-OpenWA-Signature` webhook HMAC.
   * When unset, signature verification is skipped (MVP relies on a non-guessable
   * URL + the gateway's Sender filter).
   */
  WHATSAPP_WEBHOOK_SECRET: z.string().min(16).optional(),
  /** Neon Postgres connection string (the shared coaching DB). Server-side only. */
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /**
   * Base64-encoded 32-byte master key for AES-256-GCM sealing of per-athlete secrets
   * (e.g. Intervals.icu API keys). Server-side only; never logged, never committed.
   */
  DB_ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => {
        try {
          return Buffer.from(value, "base64").length === 32;
        } catch {
          return false;
        }
      },
      { message: "DB_ENCRYPTION_KEY must be a base64-encoded 32-byte key" }
    ),
  /**
   * Bearer token the brain (Managed Agent) must present to reach coach's MCP endpoints
   * (`/api/mcp` athlete-data and `/api/intervals/mcp`). Server-side only, min 16 chars.
   */
  MCP_BEARER_TOKEN: z.string().min(16, "MCP_BEARER_TOKEN must be at least 16 characters"),
  /**
   * Base URL of the Intervals.icu API. The intervals MCP (`/api/intervals/mcp`) calls it
   * per athlete, with each athlete's own key resolved from Neon at request time.
   */
  INTERVALS_BASE_URL: z.url().default("https://intervals.icu/api/v1")
});

/**
 * `ADMIN_USER` / `ADMIN_PASSWORD` are deliberately NOT in this schema.
 *
 * This schema is validated on every request path, so any rule about the admin — missing,
 * or merely too short — would take the WhatsApp webhook and both MCP endpoints down with
 * it. The admin must never be able to break the coach. They are read and validated where
 * they are used instead: `adminCredentials()` in `src/auth.ts`, which fails closed.
 */

export type Config = z.infer<typeof configSchema>;

/**
 * Where the missing variables are supposed to live. Spelled out because this is a
 * monorepo with several `.env` files: `packages/db/.env` feeds drizzle-kit migrations
 * only, and Next reads nothing but the `.env` of the app it runs from — so a variable
 * put in the wrong one is silently absent here.
 */
const ENV_LOCATION_HINT = [
  "Where to set them:",
  "  - local dev: apps/coach/.env (see apps/coach/.env.example)",
  "  - deployed: the coach project's environment variables on Vercel",
  "packages/db/.env is NOT read by this app; it only feeds drizzle-kit migrations."
].join("\n");

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
    throw new Error(`Invalid environment configuration:\n${issues}\n\n${ENV_LOCATION_HINT}`);
  }
  return parsed.data;
}
