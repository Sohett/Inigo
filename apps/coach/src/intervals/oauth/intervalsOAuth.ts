import * as oauth from "oauth4webapi";
import { z } from "zod";
import { INTERVALS_SCOPES } from "../../domain/intervalsConnection";
import { intervalsOAuthConfig, redirectUri, type IntervalsOAuthConfig } from "./credentials";

/**
 * The Intervals.icu side of the OAuth flow (INI-69, INI-73), on `oauth4webapi`: PKCE (S256), the
 * `state` check on the way back, the code exchange and the token response validation.
 *
 * Intervals.icu (forum "Intervals.icu OAuth support", 2026-08-28): authorize without
 * `response_type`, a form-encoded exchange within 2 minutes of the redirect, a token with neither
 * refresh token nor expiry, and an `athlete` beside it. The library also sends the standard
 * `grant_type`, which Intervals.icu does not document: to confirm on the first real flow (INI-70).
 */

const AUTHORIZATION_SERVER: oauth.AuthorizationServer = {
  issuer: "https://intervals.icu",
  authorization_endpoint: "https://intervals.icu/oauth/authorize",
  token_endpoint: "https://intervals.icu/api/oauth/token"
};

/**
 * What the browser that starts a flow keeps (in an HttpOnly cookie) until Intervals.icu sends it
 * back: the `state` sent, `<link token>~<random>`, and the PKCE verifier. The callback only
 * accepts the `state` this browser holds, and only this browser's verifier redeems the code: a
 * flow started elsewhere, or a stolen code, connects nothing (OAuth login CSRF, code injection).
 */
export interface ConnectionFlow {
  state: string;
  codeVerifier: string;
}

/** The link token inside a flow's `state`, or null when the state is not one of ours. */
export function linkTokenOf(state: string): string | null {
  const [token, random, extra] = state.split("~");
  if (!token || !random || extra !== undefined) return null;
  return token;
}

/** What a successful exchange gives. Never logged: it carries the token. */
export interface ExchangedToken {
  accessToken: string;
  scopes: string[];
  /** The Intervals.icu athlete id, normalised to `i123456`. */
  intervalsAthleteId: string;
  athleteName: string | null;
}

export type CallbackOutcome =
  | { status: "denied" }
  /** Intervals.icu sent another error, or no code. */
  | { status: "error" }
  /** The response does not belong to the flow this browser started. */
  | { status: "state_mismatch" }
  /** Intervals.icu refused the code (4xx): expired after the 2 minutes, already used, wrong verifier. */
  | { status: "rejected"; httpStatus: number }
  | { status: "exchanged"; token: ExchangedToken };

/** Port: the two ends of the flow. Outages throw; everything else is an outcome. */
export interface IntervalsOAuthClient {
  /** Intervals.icu's consent page for this link, and the flow to keep in the browser. */
  begin(linkToken: string): Promise<{ authorizeUrl: string; flow: ConnectionFlow }>;
  /** Check the callback against the browser's flow, then trade the code for a token. */
  complete(callback: URLSearchParams, flow: ConnectionFlow): Promise<CallbackOutcome>;
}

/** The OAuth app and its client. */
export interface IntervalsOAuth {
  config: IntervalsOAuthConfig;
  client: IntervalsOAuthClient;
}

/** The app from the server environment with its client, or null when it is not configured. */
export function intervalsOAuth(): IntervalsOAuth | null {
  const config = intervalsOAuthConfig();
  return config ? { config, client: createIntervalsOAuthClient(config) } : null;
}

const tokenExtrasSchema = z.object({
  athlete: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    name: z.string().nullish()
  })
});

/** Intervals.icu ids are `i` plus digits; the token response may carry the bare number. */
export function normaliseIntervalsAthleteId(id: string): string {
  const trimmed = id.trim();
  return /^\d+$/.test(trimmed) ? `i${trimmed}` : trimmed;
}

/**
 * `IntervalsOAuthClient` over Intervals.icu. A 5xx, a timeout or a response the library refuses
 * throws, with a message that never carries the client secret, the code or the token (the
 * library's error causes can hold the response body, so they are not chained).
 */
export function createIntervalsOAuthClient(
  config: IntervalsOAuthConfig,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): IntervalsOAuthClient {
  const client: oauth.Client = { client_id: config.clientId };
  const clientAuth = oauth.ClientSecretPost(config.clientSecret);
  const timeoutMs = options.timeoutMs ?? 15_000;

  return {
    async begin(linkToken) {
      const flow: ConnectionFlow = {
        state: `${linkToken}~${oauth.generateRandomState()}`,
        codeVerifier: oauth.generateRandomCodeVerifier()
      };
      const url = new URL(AUTHORIZATION_SERVER.authorization_endpoint ?? "");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", redirectUri(config));
      url.searchParams.set("scope", INTERVALS_SCOPES.join(","));
      url.searchParams.set("state", flow.state);
      url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(flow.codeVerifier));
      url.searchParams.set("code_challenge_method", "S256");
      return { authorizeUrl: url.toString(), flow };
    },

    async complete(callback, flow) {
      let params: URLSearchParams;
      try {
        params = oauth.validateAuthResponse(AUTHORIZATION_SERVER, client, callback, flow.state);
      } catch (error) {
        if (!(error instanceof oauth.AuthorizationResponseError)) return { status: "state_mismatch" };
        return error.error === "access_denied" ? { status: "denied" } : { status: "error" };
      }
      if (!params.get("code")) return { status: "error" };

      const response = await oauth.authorizationCodeGrantRequest(
        AUTHORIZATION_SERVER,
        client,
        clientAuth,
        params,
        redirectUri(config),
        flow.codeVerifier,
        { signal: AbortSignal.timeout(timeoutMs), ...(options.fetchImpl ? { [oauth.customFetch]: options.fetchImpl } : {}) }
      );
      let body: oauth.TokenEndpointResponse;
      try {
        body = await oauth.processAuthorizationCodeResponse(AUTHORIZATION_SERVER, client, response);
      } catch (error) {
        if (response.status >= 400 && response.status < 500) return { status: "rejected", httpStatus: response.status };
        const reason = error instanceof Error ? error.message : "unreadable response";
        throw new Error(`Intervals.icu token endpoint answered ${response.status}: ${reason}`);
      }

      const extras = tokenExtrasSchema.safeParse(body);
      if (!extras.success) throw new Error("Intervals.icu token endpoint answered without the athlete.");
      return {
        status: "exchanged",
        token: {
          accessToken: body.access_token,
          scopes: (body.scope ?? "").split(",").filter((entry) => entry.trim() !== ""),
          intervalsAthleteId: normaliseIntervalsAthleteId(extras.data.athlete.id),
          athleteName: extras.data.athlete.name ?? null
        }
      };
    }
  };
}
