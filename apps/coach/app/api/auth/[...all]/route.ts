import { inigoAuth } from "../../../../src/identity/auth";

// Sign in, sign out, sessions: per request, never cached.
export const dynamic = "force-dynamic";

/**
 * Better Auth's endpoints (INI-85): the magic link an athlete opens from WhatsApp
 * (`/api/auth/magic-link/verify`), and a coach's Google sign in and its callback
 * (`/api/auth/callback/google`, the redirect URI registered on Google). Asking for a magic link
 * over HTTP is disabled: only the coach makes one.
 *
 * Sign in not configured answers 503 here and nowhere else.
 */
async function handle(request: Request): Promise<Response> {
  const auth = inigoAuth();
  if (!auth) return new Response("Sign in is not configured.", { status: 503 });
  return auth.handler(request);
}

export { handle as GET, handle as POST };
