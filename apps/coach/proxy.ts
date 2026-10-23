import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { authEnv } from "./src/identity/authEnv";

/**
 * First gate on the admin surface (INI-85): no session cookie, no admin. A page goes to the
 * Google sign in, an API call gets a 401.
 *
 * Only a quick check, on purpose: the proxy sees that a cookie is there, not whose it is. The
 * admin layout and every admin route read the session itself (`requireAdmin`) and let only a
 * coach in; an athlete's session never gets past them.
 *
 * Scoped to `/admin` and `/api/admin/*` by the matcher below, deliberately: the OpenWA webhook and
 * the MCP endpoints carry their own credentials (HMAC / bearer), and the athletes' pages their own
 * session. `proxy.ts` is Next 16's name for what used to be `middleware.ts`.
 *
 * Fails closed: sign in not configured means nobody gets in.
 */
export function proxy(request: NextRequest): NextResponse {
  if (!authEnv()) {
    console.error("[coach] admin refuses to serve: sign in is not configured (BETTER_AUTH_*, GOOGLE_CLIENT_*).");
    return new NextResponse("Admin is not configured.", { status: 503 });
  }

  if (getSessionCookie(request)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
