/**
 * The coaches who can open the admin (INI-85). Invitation only: a coach is first an invited
 * email, then, once they sign in with Google, a coach with an account. No rights per coach yet:
 * every coach sees everything.
 */

export const CoachStatus = {
  /** Invited, never signed in. */
  Invited: "invited",
  /** Signed in at least once: has a Better Auth user. */
  Active: "active"
} as const;

export type CoachStatus = (typeof CoachStatus)[keyof typeof CoachStatus];

export interface Coach {
  /** Lower-cased: the key of the invitation and of the Google account. */
  email: string;
  status: CoachStatus;
  /** Their Google name, once they signed in. */
  name: string | null;
  /** Who invited them; null for the first coach, seeded with the database. */
  invitedBy: string | null;
  invitedAt: Date;
}

/** An email typed in the admin, as an invitation key: trimmed and lower-cased. */
export function normaliseCoachEmail(email: string): string {
  return email.trim().toLowerCase();
}
