import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authAccount, authSession, authUser, authVerification, createDb } from "@inigo/db";
import { createDrizzleCoachRepository } from "../repositories/drizzleCoachRepository";
import { authEnv } from "./authEnv";
import { createInigoAuth, type InigoAuth } from "./betterAuth";

let cached: InigoAuth | null = null;

/**
 * The Better Auth instance on Neon, built on first use and cached, or null when its environment
 * is incomplete (fails closed: nobody signs in, nothing else notices).
 *
 * Independent of `getDeps()` on purpose, both ways: the auth never depends on the coach's own
 * configuration, and the webhook and the MCP servers never depend on the auth's.
 */
export function inigoAuth(): InigoAuth | null {
  if (cached !== null) return cached;
  const env = authEnv();
  if (!env) return null;
  const db = createDb(env.databaseUrl);
  const coaches = createDrizzleCoachRepository(db);
  cached = createInigoAuth({
    env,
    // `neon-http` has no interactive transaction; Better Auth needs none on Postgres.
    database: drizzleAdapter(db, {
      provider: "pg",
      transaction: false,
      schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification }
    }),
    isInvitedCoach: (email) => coaches.isInvited(email)
  });
  return cached;
}
