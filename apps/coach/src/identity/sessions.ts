import type { Athlete } from "../domain/athlete";
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
 *
 * The athlete's user is made here, with its `athleteId`, before their first link: Better Auth
 * never creates one from a link, and nothing ever reads the athlete back from an email.
 */
export function magicLinkIssuer(auth: InigoAuth | null = inigoAuth(), now: () => Date = () => new Date()): AthleteLinkIssuer | null {
  if (!auth) return null;
  return {
    async issue(athlete, path) {
      await ensureAthleteUser(auth, athlete);
      const expiresAt = new Date(now().getTime() + MAGIC_LINK_TTL_SECONDS * 1000);
      const url = await captureMagicLink(() =>
        auth.api.signInMagicLink({
          body: {
            email: athleteEmail(athlete.id),
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

/** The athlete's Better Auth user, created on their first link. Two first links at once: one wins. */
async function ensureAthleteUser(auth: InigoAuth, athlete: Pick<Athlete, "id" | "displayName">): Promise<void> {
  const context = await auth.$context;
  const email = athleteEmail(athlete.id);
  if (await context.internalAdapter.findUserByEmail(email)) return;
  try {
    await context.internalAdapter.createUser(
      { email, name: athlete.displayName ?? "", emailVerified: true, athleteId: athlete.id },
      { method: "magic-link" }
    );
  } catch (error) {
    // The unique email lost a race with a concurrent first link: that user is the same athlete's.
    if (await context.internalAdapter.findUserByEmail(email)) return;
    throw error;
  }
}
