import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { SignInState } from "./src/domain/signedIn";
import { authEnv } from "./src/identity/authEnv";
import { whoIsSignedIn } from "./src/identity/sessions";

/**
 * The gate on the admin surface (INI-85): only a signed in staff member gets through, on every request,
 * page or API, client navigation included. An athlete's session is a valid session too (any
 * magic link opens one), so checking that a cookie exists is not enough, and neither is the admin
 * layout alone: Next does not render a layout again on client navigation, so a page segment can
 * be fetched without it. The layout and every admin route still check again (`requireAdmin`).
 *
 * A page goes to the Google sign in, an API call gets a 401 (signed out) or 403 (athlete).
 *
 * Scoped to `/admin` and `/api/admin/*` by the matcher below, deliberately: the OpenWA webhook and
 * the MCP endpoints carry their own credentials (HMAC / bearer), and the athletes' pages their own
 * session. `proxy.ts` is Next 16's name for what used to be `middleware.ts`, and it runs on the
 * Node.js runtime, so it can read the session from Neon.
 *
 * Fails closed: sign in not configured means nobody gets in.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!authEnv()) return notConfigured();
  // No cookie at all: no need to ask the database.
  if (!getSessionCookie(request)) return refuse(request, 401);

  const signedIn = await whoIsSignedIn(request.headers);
  switch (signedIn.state) {
    case SignInState.Staff:
      return NextResponse.next();
    case SignInState.Unavailable:
      return notConfigured();
    case SignInState.SignedOut:
      return refuse(request, 401);
    case SignInState.Athlete:
      return refuse(request, 403);
  }
}

function notConfigured(): NextResponse {
  console.error("[coach] admin refuses to serve: sign in is not configured (BETTER_AUTH_*, GOOGLE_CLIENT_*).");
  return new NextResponse("Admin is not configured.", { status: 503 });
}

function refuse(request: NextRequest, status: 401 | 403): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: status === 401 ? "unauthorized" : "forbidden" }, { status });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
