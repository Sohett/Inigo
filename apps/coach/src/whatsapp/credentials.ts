/**
 * OpenWA gateway credentials, read where they are used rather than in `configSchema`.
 *
 * `configSchema` is parsed on *every* request path, so a WhatsApp variable declared there
 * would take the webhook and the two other MCP servers down with it the day it is missing or
 * malformed. That exact failure already happened once with `ADMIN_PASSWORD`. Keeping these
 * three here means a missing variable degrades `/api/whatsapp/mcp` alone.
 */
export interface OpenWaCredentials {
  baseUrl: string;
  apiKey: string;
  /** The gateway session **UUID** (not its name) — see `OpenWaClientOptions.sessionId`. */
  sessionId: string;
}

/** Read the credentials from the server environment. Fails closed: null when incomplete. */
export function openWaCredentials(env: NodeJS.ProcessEnv = process.env): OpenWaCredentials | null {
  const baseUrl = env["OPENWA_BASE_URL"];
  const apiKey = env["OPENWA_API_KEY"];
  const sessionId = env["OPENWA_SESSION_ID"];
  if (!baseUrl || !apiKey || !sessionId) return null;
  return { baseUrl, apiKey, sessionId };
}
