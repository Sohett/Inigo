/**
 * The backoffice team (INI-85). Invitation only: a member is first an invited email, then, once
 * they sign in with Google, an active member. Their roles say what they do (`admin`, `coach`, or
 * both); they grant nothing yet: every member has the same access to the backoffice.
 */

export const StaffRole = {
  /** Runs the backoffice. */
  Admin: "admin",
  /** Coaches athletes. */
  Coach: "coach"
} as const;

export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

export const STAFF_ROLES: readonly StaffRole[] = Object.values(StaffRole);

export const StaffStatus = {
  /** Invited, never signed in. */
  Invited: "invited",
  /** Signed in at least once: has a Better Auth user. */
  Active: "active"
} as const;

export type StaffStatus = (typeof StaffStatus)[keyof typeof StaffStatus];

export interface StaffMember {
  /** Lower-cased: the key of the invitation and of the Google account. */
  email: string;
  /** At least one. */
  roles: StaffRole[];
  status: StaffStatus;
  /** Their Google name, once they signed in. */
  name: string | null;
  /** Who invited them; null for the first member, seeded with the database. */
  invitedBy: string | null;
  invitedAt: Date;
}

/** An email typed in the backoffice, as a membership key: trimmed and lower-cased. */
export function normaliseStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}
