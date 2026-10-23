import { SignInState, type SignedIn } from "../domain/signedIn";
import type { AthleteLinkIssuer } from "../use-cases/createAthleteLink";
import { athleteEmail } from "./athleteEmail";
import { inigoAuth } from "./auth";
import { MAGIC_LINK_TTL_SECONDS, type InigoAuth } from "./betterAuth";
import { captureMagicLink } from "./magicLinkCapture";

/**
 * Who the request's session cookie belongs to (INI-85). A database outage throws: the caller
 * decides what a page or a route shows then.
 */
export async function whoIsSignedIn(headers: Headers, auth: InigoAuth | null = inigoAuth()): Promise<SignedIn> {
  if (!auth) return { state: SignInState.Unavailable };
  const session = await auth.api.getSession({ headers });
  if (!session) return { state: SignInState.SignedOut };
  const { user } = session;
  switch (user.role) {
    // The athlete comes from the foreign key, never from parsing the email.
    case "athlete":
      return user.athleteId ? { state: SignInState.Athlete, athleteId: user.athleteId } : { state: SignInState.SignedOut };
    case "staff":
      return { state: SignInState.Staff, email: user.email, name: user.name === "" ? null : user.name };
    default:
      return { state: SignInState.SignedOut };
  }
}

/**
 * `AthleteLinkIssuer` over Better Auth: a magic link that signs the athlete in and lands them on
 * `path`, also where a used or expired link lands (with `?error=`), so that a second click from a
 * browser already signed in still shows the page. Null when sign in is not configured.
 */
export function magicLinkIssuer(auth: InigoAuth | null = inigoAuth(), now: () => Date = () => new Date()): AthleteLinkIssuer | null {
  if (!auth) return null;
  return {
    async issue(athlete, path) {
      const expiresAt = new Date(now().getTime() + MAGIC_LINK_TTL_SECONDS * 1000);
      const url = await captureMagicLink(() =>
        auth.api.signInMagicLink({
          body: {
            email: athleteEmail(athlete.id),
            // Only used when the athlete's user is created, on their first link.
            name: athlete.displayName ?? "",
            callbackURL: path,
            errorCallbackURL: path
          },
          headers: new Headers()
        })
      );
      return { url, expiresAt };
    }
  };
}
