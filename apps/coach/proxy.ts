import { NextResponse, type NextRequest } from "next/server";
import {
  adminCredentials,
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_USER_MIN_LENGTH,
  BASIC_AUTH_CHALLENGE,
  verifyBasicAuth
} from "./src/auth";

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
 * through `loadConfig`, on purpose: the gate must not answer 500 (and leak a config dump
 * into the logs) because some unrelated variable is missing.
 *
 * Fails closed: no credentials configured means nobody gets in.
 */
export function proxy(request: NextRequest): NextResponse {
  const credentials = adminCredentials();
  if (!credentials) {
    // One template literal, not a concatenation: Turbopack folded the two-part version
    // into a truncated message, and this is the line an operator reads when admin is down.
    console.error(
      `[coach] admin refuses to serve. Set ADMIN_USER (min ${ADMIN_USER_MIN_LENGTH} chars) and ADMIN_PASSWORD (min ${ADMIN_PASSWORD_MIN_LENGTH} chars).`
    );
    return new NextResponse("Admin is not configured.", { status: 503 });
  }

  if (
    !verifyBasicAuth(request.headers.get("authorization"), credentials.user, credentials.password)
  ) {
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
