import { z } from "zod";

/**
 * What Better Auth needs (INI-85), read where it is used rather than in `configSchema`: same rule
 * as the Intervals.icu OAuth app and the OpenWA credentials. `configSchema` is parsed on every
 * request path, so a missing auth variable there would take the WhatsApp webhook and the MCP
 * servers down with it. Here, it only turns sign in off: the admin answers 503 and the athletes'
 * links are unavailable.
 */
export interface AuthEnv {
  /** Signs session cookies and hashes. At least 32 characters. */
  secret: string;
  /** Public origin of this app, e.g. `https://app.inigo-coach.com`: links and the Google redirect URI. */
  baseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  databaseUrl: string;
}

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  GOOGLE_CLIENT_ID: z.string().trim().min(1),
  GOOGLE_CLIENT_SECRET: z.string().trim().min(1),
  DATABASE_URL: z.string().min(1)
});

/** Read the auth settings from the server environment. Fails closed: null when incomplete. */
export function authEnv(env: Record<string, string | undefined> = process.env): AuthEnv | null {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) return null;
  return {
    secret: parsed.data.BETTER_AUTH_SECRET,
    baseUrl: parsed.data.BETTER_AUTH_URL,
    googleClientId: parsed.data.GOOGLE_CLIENT_ID,
    googleClientSecret: parsed.data.GOOGLE_CLIENT_SECRET,
    databaseUrl: parsed.data.DATABASE_URL
  };
}
