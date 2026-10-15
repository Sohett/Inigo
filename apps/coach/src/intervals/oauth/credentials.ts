import { z } from "zod";

/**
 * The Intervals.icu OAuth app (INI-69), read where it is used rather than in `configSchema`:
 * same rule as the OpenWA and admin credentials. `configSchema` is parsed on every request path,
 * so a missing OAuth variable there would take the WhatsApp webhook and the MCP servers down
 * with it. Here, it only turns the OAuth connection off, and the onboarding agent falls back to
 * the API key.
 */
export interface IntervalsOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Public origin of this app, e.g. `https://app.inigo-coach.com`: links and the redirect URI. */
  publicUrl: string;
}

const envSchema = z.object({
  INTERVALS_OAUTH_CLIENT_ID: z.string().trim().min(1),
  INTERVALS_OAUTH_CLIENT_SECRET: z.string().trim().min(1),
  COACH_PUBLIC_URL: z.url().transform((url) => url.replace(/\/+$/, ""))
});

/** Read the OAuth app from the server environment. Fails closed: null when incomplete. */
export function intervalsOAuthConfig(env: Record<string, string | undefined> = process.env): IntervalsOAuthConfig | null {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) return null;
  return {
    clientId: parsed.data.INTERVALS_OAUTH_CLIENT_ID,
    clientSecret: parsed.data.INTERVALS_OAUTH_CLIENT_SECRET,
    publicUrl: parsed.data.COACH_PUBLIC_URL
  };
}

/** Where Intervals.icu sends the athlete back. Must match a redirect URI registered on the app. */
export function redirectUri(config: IntervalsOAuthConfig): string {
  return `${config.publicUrl}/connect/intervals/callback`;
}
