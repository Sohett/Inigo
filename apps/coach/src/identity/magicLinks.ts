import type { SignInLinkIssuer } from "../use-cases/createAthleteLink";
import { athleteEmail } from "./athleteEmail";
import { inigoAuth } from "./auth";
import { MAGIC_LINK_TTL_SECONDS, type InigoAuth } from "./betterAuth";
import { captureMagicLink } from "./magicLinkCapture";

/**
 * `SignInLinkIssuer` over Better Auth (INI-85): a magic link that signs the athlete's existing
 * user in and lands them on `path`, also where a used or expired link lands (with `?error=`), so
 * that a second click from a browser already signed in still shows the page. Null when sign in
 * is not configured.
 */
export function magicLinkIssuer(auth: InigoAuth | null = inigoAuth(), now: () => Date = () => new Date()): SignInLinkIssuer | null {
  if (!auth) return null;
  return {
    async issue(athleteId, path) {
      const expiresAt = new Date(now().getTime() + MAGIC_LINK_TTL_SECONDS * 1000);
      const url = await captureMagicLink(() =>
        auth.api.signInMagicLink({
          body: { email: athleteEmail(athleteId), callbackURL: path, errorCallbackURL: path },
          headers: new Headers()
        })
      );
      return { url, expiresAt };
    }
  };
}
