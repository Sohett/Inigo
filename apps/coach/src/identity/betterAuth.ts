import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import type { AuthEnv } from "./authEnv";
import { deliverMagicLink } from "./magicLinkCapture";

/**
 * The coach's Better Auth instance (INI-85): one library for both kinds of users, so no
 * cryptography or session handling of our own.
 *
 * - **Athletes** sign in with a magic link that the agent sends on WhatsApp, the only proof of who
 *   they are. Never by request: the public endpoint is disabled and the link is captured, not sent.
 *   Their user is created by our code with its `athleteId` before the first link (`./sessions`);
 *   a magic link never creates a user.
 * - **Staff** (the backoffice team: admins, coaches) sign in with Google, on invitation only.
 *
 * Built by a factory so the specs run it on Better Auth's memory adapter; `inigoAuth()` in
 * `./auth` builds the real one on Neon.
 */

/** How long a magic link stays valid. Sent when the athlete needs it; asking again is free. */
export const MAGIC_LINK_TTL_SECONDS = 60 * 60;

/** The magic link endpoint: links are only ever made by the server (`auth.api`), never by a request. */
const MAGIC_LINK_REQUEST_PATH = "/sign-in/magic-link";

export interface InigoAuthDeps {
  env: Pick<AuthEnv, "secret" | "baseUrl" | "googleClientId" | "googleClientSecret">;
  /** Better Auth's database adapter: Drizzle on Neon, or memory in the specs. */
  database: Parameters<typeof betterAuth>[0]["database"];
  /** Whether this (lower-cased) email is a member of the backoffice team. */
  isStaffMember: (email: string) => Promise<boolean>;
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
        role: { type: "string", required: true, input: false },
        /** The athlete this user is (foreign key to `athlete`); null for staff. */
        athleteId: { type: "string", required: false, input: false }
      }
    },
    socialProviders: {
      google: {
        clientId: deps.env.googleClientId,
        clientSecret: deps.env.googleClientSecret,
        prompt: "select_account"
      }
    },
    disabledPaths: [MAGIC_LINK_REQUEST_PATH],
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        // The athlete's user exists before their first link: a link that names nobody signs in nobody.
        disableSignUp: true,
        // Never sent: handed to the capture our code opened, refused outside one, and only ever
        // for an athlete's user (a staff member signs in with Google, never by link).
        sendMagicLink: async ({ email, url }, ctx) => {
          const found = await ctx?.context.internalAdapter.findUserByEmail(email);
          // The adapter's user type does not carry our additional fields; the row does.
          const role: unknown = (found?.user as { role?: unknown } | undefined)?.role;
          if (role !== "athlete") throw new Error("A magic link is only ever made for an athlete.");
          deliverMagicLink(url);
        }
      })
    ],
    databaseHooks: {
      user: {
        create: {
          // A new user's role is decided once, here, never by a request. An `athleteId` can only
          // come from our own code (`input: false`, and Google's profile carries none): that user
          // is an athlete, tied to them by a foreign key. Anyone else must be a staff member.
          before: async (user) => {
            const athleteId = typeof user.athleteId === "string" ? user.athleteId : null;
            if (athleteId !== null) return { data: { ...user, role: "athlete", athleteId } };
            if (await deps.isStaffMember(user.email.toLowerCase())) return { data: { ...user, role: "staff", athleteId: null } };
            throw new APIError("FORBIDDEN", { message: "This account has not been invited." });
          }
        }
      }
    }
  });
}

export type InigoAuth = ReturnType<typeof createInigoAuth>;
