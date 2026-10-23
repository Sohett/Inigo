import { SignInState } from "../domain/signedIn";
import { whoIsSignedIn } from "../identity/sessions";

/** JSON response helper, mirroring the shape the webhook route uses. */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** The coach behind an admin request. */
export interface AdminCoach {
  email: string;
  name: string | null;
}

export type AdminAccess = { coach: AdminCoach; denied: null } | { coach: null; denied: Response };

/**
 * Check, inside a route handler, that the request comes from a signed in coach (INI-85).
 *
 * `proxy.ts` already turns away requests without a session cookie, but authorization is not left
 * to the proxy alone: it only sees that a cookie is there, not whose it is, and a matcher typo or
 * a route that moves out from under it would otherwise open a write endpoint silently.
 *
 * Fails closed: sign in not configured answers 503, no session 401, an athlete's session 403.
 * An unreadable session store throws, and the route's caller answers 500 as for any outage.
 */
export async function requireAdmin(request: Request): Promise<AdminAccess> {
  const signedIn = await whoIsSignedIn(request.headers);
  switch (signedIn.state) {
    case SignInState.Coach:
      return { coach: { email: signedIn.email, name: signedIn.name }, denied: null };
    case SignInState.Unavailable:
      console.error("[coach] admin refuses to serve: sign in is not configured (BETTER_AUTH_*, GOOGLE_CLIENT_*).");
      return { coach: null, denied: json({ ok: false, error: "admin_not_configured" }, 503) };
    case SignInState.SignedOut:
      return { coach: null, denied: json({ ok: false, error: "unauthorized" }, 401) };
    case SignInState.Athlete:
      return { coach: null, denied: json({ ok: false, error: "forbidden" }, 403) };
  }
}
