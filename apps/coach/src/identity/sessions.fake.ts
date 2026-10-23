import { SignInState, type SignedIn } from "../domain/signedIn";

/**
 * A stand-in for `./sessions` in route specs: who is signed in is read from a test header instead
 * of a Better Auth session, so a spec says `{ ...AS_COACH }` rather than minting a cookie.
 *
 *   vi.mock("…/src/identity/sessions", () => import("…/src/identity/sessions.fake"));
 */
const HEADER = "x-test-signed-in-as";

export const AS_COACH = { [HEADER]: "coach" } as const;
export const AS_ATHLETE = { [HEADER]: "athlete" } as const;
/** As if Better Auth were not configured on this deployment. */
export const AS_UNCONFIGURED = { [HEADER]: "unavailable" } as const;

export const FAKE_COACH_EMAIL = "coach@example.com";
export const FAKE_ATHLETE_ID = "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f";

export async function whoIsSignedIn(headers: Headers): Promise<SignedIn> {
  switch (headers.get(HEADER)) {
    case "coach":
      return { state: SignInState.Coach, email: FAKE_COACH_EMAIL, name: "Coach" };
    case "athlete":
      return { state: SignInState.Athlete, athleteId: FAKE_ATHLETE_ID };
    case "unavailable":
      return { state: SignInState.Unavailable };
    default:
      return { state: SignInState.SignedOut };
  }
}

export function magicLinkIssuer() {
  return null;
}
