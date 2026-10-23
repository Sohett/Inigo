import { staffRolesOf } from "../domain/staff";
import { SignInState, type SignedIn } from "../domain/signedIn";
import { inigoAuth } from "./auth";
import type { InigoAuth } from "./betterAuth";

/**
 * Who the request's session cookie belongs to (INI-85). A database outage throws: the caller
 * decides what a page or a route shows then.
 */
export async function whoIsSignedIn(headers: Headers, auth: InigoAuth | null = inigoAuth()): Promise<SignedIn> {
  if (!auth) return { state: SignInState.Unavailable };
  const session = await auth.api.getSession({ headers });
  if (!session) return { state: SignInState.SignedOut };
  const { user } = session;
  // The athlete comes from the foreign key, never from the email.
  if (user.role === "athlete") {
    return user.athleteId ? { state: SignInState.Athlete, athleteId: user.athleteId } : { state: SignInState.SignedOut };
  }
  if (staffRolesOf(user.role).length > 0) {
    return { state: SignInState.Staff, email: user.email, name: user.name === "" ? null : user.name };
  }
  return { state: SignInState.SignedOut };
}
