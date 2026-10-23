/**
 * Who is signed in on a request (INI-85), whatever signs them in. An athlete comes from a magic
 * link sent on WhatsApp, a coach from Google. Independent of Better Auth: `identity/sessions.ts`
 * maps its session onto this.
 */
export const SignInState = {
  /** Sign in is not configured on this deployment: nobody can be signed in. */
  Unavailable: "unavailable",
  SignedOut: "signed_out",
  Athlete: "athlete",
  Coach: "coach"
} as const;

export type SignedIn =
  | { state: typeof SignInState.Unavailable }
  | { state: typeof SignInState.SignedOut }
  | { state: typeof SignInState.Athlete; athleteId: string }
  | { state: typeof SignInState.Coach; email: string; name: string | null };
