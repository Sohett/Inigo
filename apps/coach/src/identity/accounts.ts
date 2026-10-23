import { APIError } from "better-auth/api";
import { staffRolesOf, StaffStatus, type StaffMember } from "../domain/staff";
import type { AthleteAccountRepository } from "../repositories/athleteAccountRepository";
import type { StaffRepository } from "../repositories/staffRepository";
import { athleteEmail } from "./athleteEmail";
import { inigoAuth } from "./auth";
import type { InigoAuth } from "./betterAuth";

/**
 * The users of the coach app, through Better Auth's `admin` plugin (INI-87): the adapters behind
 * `AthleteAccountRepository` and `StaffRepository`. Only its public API (`auth.api`), never its
 * tables: Better Auth makes the ids, validates the input, and removes a user's sessions with them.
 */

/** The admin plugin's error when the email already has a user. */
const USER_EXISTS = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";
/** The team is small: one page holds it. */
const TEAM_PAGE = 500;

function alreadyExists(error: unknown): boolean {
  return error instanceof APIError && (error.body as { code?: string } | undefined)?.code === USER_EXISTS;
}

/** Athletes' users, made by the server itself: creating one needs no session. */
export function betterAuthAthleteAccounts(auth: InigoAuth): AthleteAccountRepository {
  return {
    async ensure(athlete) {
      try {
        await auth.api.createUser({
          body: {
            email: athleteEmail(athlete.id),
            name: athlete.displayName ?? "",
            role: "athlete",
            // WhatsApp proved who they are; the magic link is how they sign in.
            data: { athleteId: athlete.id, emailVerified: true }
          }
        });
      } catch (error) {
        // An earlier link, or a concurrent one, made their user already: nothing to do.
        if (!alreadyExists(error)) throw error;
      }
    }
  };
}

/**
 * The backoffice team, acting as the signed in staff member whose request headers are given: the
 * admin plugin checks their session and permissions on every call.
 *
 * Known limit: the plugin's `listUsers` answers an empty list, not an error, when the database
 * fails, so the team page would show nobody rather than an outage.
 */
export function betterAuthStaff(auth: InigoAuth, actor: Headers): StaffRepository {
  async function staffUserId(email: string): Promise<string | null> {
    const { users } = await auth.api.listUsers({
      query: { filterField: "email", filterOperator: "eq", filterValue: email, limit: 1 },
      headers: actor
    });
    const [user] = users;
    return user && staffRolesOf(user.role).length > 0 ? user.id : null;
  }

  return {
    async list() {
      const { users } = await auth.api.listUsers({
        query: { filterField: "role", filterOperator: "ne", filterValue: "athlete", sortBy: "createdAt", limit: TEAM_PAGE },
        headers: actor
      });
      return users.map(
        (user): StaffMember => ({
          email: user.email,
          roles: staffRolesOf(user.role),
          // Their Google account verified the email when it linked: until then, still invited.
          status: user.emailVerified ? StaffStatus.Active : StaffStatus.Invited,
          name: user.name === "" ? null : user.name,
          // `listUsers` types its users without our additional fields; the rows carry them.
          invitedBy: (user as typeof user & { invitedBy?: string | null }).invitedBy ?? null,
          invitedAt: new Date(user.createdAt)
        })
      );
    },

    async create(member) {
      try {
        await auth.api.createUser({
          body: { email: member.email, name: "", role: member.roles, data: { invitedBy: member.invitedBy } },
          headers: actor
        });
        return true;
      } catch (error) {
        if (alreadyExists(error)) return false;
        throw error;
      }
    },

    async remove(email) {
      const userId = await staffUserId(email);
      if (userId === null) return false;
      await auth.api.removeUser({ body: { userId }, headers: actor });
      return true;
    }
  };
}

/** The athletes' users on this deployment's Better Auth, or null when sign in is not configured. */
export function athleteAccountsOnDeployment(auth: InigoAuth | null = inigoAuth()): AthleteAccountRepository | null {
  return auth ? betterAuthAthleteAccounts(auth) : null;
}

/** The team, acting as the member signed in on these headers, or null when sign in is not configured. */
export function staffOnDeployment(actor: Headers, auth: InigoAuth | null = inigoAuth()): StaffRepository | null {
  return auth ? betterAuthStaff(auth, actor) : null;
}
