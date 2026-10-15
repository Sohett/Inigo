import { z } from "zod";
import { INTERVALS_SCOPES } from "../../domain/intervalsConnection";
import { redirectUri, type IntervalsOAuthConfig } from "./credentials";

/**
 * The Intervals.icu side of the OAuth flow (INI-69), as documented by Intervals.icu
 * (forum "Intervals.icu OAuth support", 2026-08-28): no `response_type`, no `grant_type`, a
 * form-encoded exchange within 2 minutes of the redirect, and a token with neither refresh token
 * nor expiry.
 */

const AUTHORIZE_URL = "https://intervals.icu/oauth/authorize";
const TOKEN_URL = "https://intervals.icu/api/oauth/token";

/** Where the athlete grants access. `state` comes back untouched on the callback. */
export function authorizeUrl(config: IntervalsOAuthConfig, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri(config));
  url.searchParams.set("scope", INTERVALS_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  scope: z.string().default(""),
  athlete: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    name: z.string().nullish()
  })
});

/** What a successful exchange gives. Never logged: it carries the token. */
export interface ExchangedToken {
  accessToken: string;
  scopes: string[];
  /** The Intervals.icu athlete id, normalised to `i123456`. */
  intervalsAthleteId: string;
  athleteName: string | null;
}

export type CodeExchange = { status: "exchanged"; token: ExchangedToken } | { status: "rejected"; httpStatus: number };

/** Port: trade an authorization code for an access token. Outages throw; a refusal is returned. */
export interface IntervalsTokenExchanger {
  exchange(code: string): Promise<CodeExchange>;
}

/** Intervals.icu ids are `i` plus digits; the token response may carry the bare number. */
export function normaliseIntervalsAthleteId(id: string): string {
  const trimmed = id.trim();
  return /^\d+$/.test(trimmed) ? `i${trimmed}` : trimmed;
}

/**
 * `IntervalsTokenExchanger` over the token endpoint. A 4xx is a refused code (expired after the
 * 2 minutes, already used, wrong client): returned, so the athlete gets a clear page. A 5xx, a
 * timeout or an unreadable body throws. Error messages never carry the client secret, the code
 * or the token.
 */
export function createIntervalsTokenExchanger(
  config: IntervalsOAuthConfig,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): IntervalsTokenExchanger {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  return {
    async exchange(code) {
      const response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: redirectUri(config)
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.status >= 400 && response.status < 500) return { status: "rejected", httpStatus: response.status };
      if (!response.ok) throw new Error(`Intervals.icu token endpoint answered ${response.status}.`);

      const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new Error("Intervals.icu token endpoint answered an unexpected body.");
      const { access_token, scope, athlete } = parsed.data;
      return {
        status: "exchanged",
        token: {
          accessToken: access_token,
          scopes: scope.split(",").filter((entry) => entry.trim() !== ""),
          intervalsAthleteId: normaliseIntervalsAthleteId(athlete.id),
          athleteName: athlete.name ?? null
        }
      };
    }
  };
}
