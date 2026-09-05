import { NextResponse, type NextRequest } from "next/server";
import { BASIC_AUTH_CHALLENGE, verifyBasicAuth } from "./src/auth";

/**
 * HTTP Basic gate on the admin surface.
 *
 * Scoped to `/admin` and `/api/admin/*` by the matcher below, deliberately: the OpenWA
 * webhook and the two MCP endpoints carry their own credentials (HMAC / bearer) and must
 * never see a Basic challenge, which would break the gateway and the brain.
 *
 * `proxy.ts` is Next 16's name for what used to be `middleware.ts`, and Next always runs it
 * on the Node.js runtime — so the constant-time comparison in `src/auth.ts` (`node:crypto`)
 * works here. It reads the two admin variables straight from the environment rather than
 * through `loadConfig`, on purpose: the gate must not answer 500 (and leak a config dump into
 * the logs) because some unrelated variable is missing. `loadConfig` still validates both at
 * boot for everything else. Access is static so bundlers that inline env keep working.
 *
 * Fails closed: no credentials configured means nobody gets in.
 */
export function proxy(request: NextRequest): NextResponse {
  const user = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;

  if (!user || !password) {
    console.error("[coach] admin is unreachable: ADMIN_USER / ADMIN_PASSWORD are not set");
    return new NextResponse("Admin is not configured.", { status: 503 });
  }

  if (!verifyBasicAuth(request.headers.get("authorization"), user, password)) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": BASIC_AUTH_CHALLENGE }
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
