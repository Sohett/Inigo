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
  const create = (athlete: Parameters<AthleteAccountRepository["ensure"]>[0]) =>
    auth.api.createUser({
      body: {
        email: athleteEmail(athlete.id),
        name: athlete.displayName ?? "",
        role: "athlete",
        // WhatsApp proved who they are; the magic link is how they sign in.
        data: { athleteId: athlete.id, emailVerified: true }
      }
    });

  return {
    async ensure(athlete) {
      try {
        await create(athlete);
      } catch (error) {
        // An earlier link made their user already: nothing to do.
        if (alreadyExists(error)) return;
        // A concurrent first link may have inserted it between the plugin's check and its own
        // insert: the database then refuses ours. Asking once more tells which it was.
        try {
          await create(athlete);
        } catch (retryError) {
          if (!alreadyExists(retryError)) throw retryError;
        }
      }
    }
  };
}

/**
 * The backoffice team, acting as the signed in staff member whose request headers are given: the
 * admin plugin checks their session and permissions on every call.
 *
 * The plugin's `listUsers` answers an empty list, not an error, when the database fails. The
 * acting member is a user too, so a list that cannot even see them is an outage, and throws:
 * the team page and the removal then fail as outages, never as "nobody" or "not a member".
 */
export function betterAuthStaff(auth: InigoAuth, actor: Headers): StaffRepository {
  async function databaseAnswers(): Promise<void> {
    const { users } = await auth.api.listUsers({ query: { limit: 1 }, headers: actor });
    if (users.length === 0) throw new Error("Better Auth could not list users: the database did not answer.");
  }

  async function staffUserId(email: string): Promise<string | null> {
    const { users } = await auth.api.listUsers({
      query: { filterField: "email", filterOperator: "eq", filterValue: email, limit: 1 },
      headers: actor
    });
    const [user] = users;
    if (!user) {
      await databaseAnswers();
      return null;
    }
    return staffRolesOf(user.role).length > 0 ? user.id : null;
  }

  return {
    async list() {
      const { users } = await auth.api.listUsers({
        query: { filterField: "role", filterOperator: "ne", filterValue: "athlete", sortBy: "createdAt", limit: TEAM_PAGE },
        headers: actor
      });
      // The acting member is on the team: an empty team is an outage.
      if (users.length === 0) await databaseAnswers();
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
