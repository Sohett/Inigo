import { betterAuth } from "better-auth";
import { admin, magicLink } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { AuthEnv } from "./authEnv";
import { deliverMagicLink } from "./magicLinkCapture";

/**
 * The coach's Better Auth instance (INI-85, INI-87). Signing in **only authenticates users that
 * already exist**: it never creates one, and this config holds no business rule (no hook, no check
 * of a role). Users are created and removed by our use-cases (`createAthleteLink`,
 * `inviteStaffMember`, `removeStaffMember`) through Better Auth's `admin` plugin (`./accounts.ts`).
 *
 * - **Athletes** sign in with a magic link the agent sends on WhatsApp. Never on request: the
 *   public endpoint is disabled, and the link is captured for the use-case, not sent.
 * - **Staff** sign in with Google; their Google account is linked to their existing user on their
 *   first sign in.
 *
 * Built by a factory so the specs run it on Better Auth's memory adapter; `inigoAuth()` in
 * `./auth` builds the real one on Neon.
 */

/** How long a magic link stays valid. Sent when the athlete needs it; asking again is free. */
export const MAGIC_LINK_TTL_SECONDS = 60 * 60;

/**
 * Endpoints never served over HTTP: links and users are only ever made by our use-cases, through
 * `auth.api` (which these do not block). The admin plugin's whole HTTP surface goes, since the
 * backoffice works through our own routes.
 */
const DISABLED_PATHS = [
  "/sign-in/magic-link",
  "/admin/ban-user",
  "/admin/create-user",
  "/admin/get-user",
  "/admin/has-permission",
  "/admin/impersonate-user",
  "/admin/list-user-sessions",
  "/admin/list-users",
  "/admin/remove-user",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/stop-impersonating",
  "/admin/unban-user",
  "/admin/update-user"
];

/**
 * The roles of Better Auth's admin plugin, with its own access control. `admin` and `coach` are
 * both staff and have the same permissions for now (managing the team): telling them apart is a
 * product decision to come, and it will be made here. `athlete` has none.
 */
const accessControl = createAccessControl(defaultStatements);
// `set-role`: the plugin requires it to create a user with a role (an invitation).
const STAFF_PERMISSIONS = { user: ["create", "set-role", "list", "get", "delete"], session: ["list", "revoke", "delete"] } as const;
const ROLES = {
  admin: accessControl.newRole(STAFF_PERMISSIONS),
  coach: accessControl.newRole(STAFF_PERMISSIONS),
  athlete: accessControl.newRole({ user: [], session: [] })
};

export interface InigoAuthDeps {
  env: Pick<AuthEnv, "secret" | "baseUrl" | "googleClientId" | "googleClientSecret">;
  /** Better Auth's database adapter: Drizzle on Neon, or memory in the specs. */
  database: Parameters<typeof betterAuth>[0]["database"];
}

export function createInigoAuth(deps: InigoAuthDeps) {
  return betterAuth({
    appName: "Inigo",
    baseURL: deps.env.baseUrl,
    secret: deps.env.secret,
    database: deps.database,
    // Better Auth's own names are kept in code; the tables are `auth_*` (see `@inigo/db`).
    user: {
      additionalFields: {
        athleteId: { type: "string", required: false, input: false },
        invitedBy: { type: "string", required: false, input: false }
      }
    },
    account: {
      accountLinking: {
        // A staff member's user is created at their invitation, email not yet verified: their
        // Google account (which verifies it) must link to it on their first sign in. The check
        // this relaxes guards against someone signing up first with another's email, which no one
        // can do here: nobody signs up.
        requireLocalEmailVerified: false,
        // The invited user has no name yet: take their Google name (and picture) when it links.
        updateUserInfoOnLink: true
      }
    },
    socialProviders: {
      google: {
        clientId: deps.env.googleClientId,
        clientSecret: deps.env.googleClientSecret,
        prompt: "select_account",
        // Signing in never creates a user: a Google account nobody invited gets nowhere.
        disableSignUp: true
      }
    },
    disabledPaths: DISABLED_PATHS,
    plugins: [
      admin({ ac: accessControl, roles: ROLES, adminRoles: ["admin", "coach"], defaultRole: "athlete" }),
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        // A link for an email no user has signs in nobody: it never creates one.
        disableSignUp: true,
        // Never sent: handed to the capture the use-case opened.
        sendMagicLink: async ({ url }) => deliverMagicLink(url)
      })
    ]
  });
}

export type InigoAuth = ReturnType<typeof createInigoAuth>;
