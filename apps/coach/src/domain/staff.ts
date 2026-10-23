/**
 * The backoffice team (INI-85, INI-87). Invitation only: a member is a user of the coach app
 * from their invitation on, invited until they first sign in with Google, then active. Their roles say what they do (`admin`, `coach`, or
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
  /** Invited (their user exists), never signed in yet. */
  Invited: "invited",
  /** Signed in with Google at least once: their account is linked, and their email verified. */
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

/**
 * The staff roles in a stored role (`admin,coach`: Better Auth's admin plugin joins several with a
 * comma), in a stable order. Empty for an athlete, or for anything that is not staff.
 */
export function staffRolesOf(role: string | null | undefined): StaffRole[] {
  const stored = (role ?? "").split(",").map((entry) => entry.trim());
  return STAFF_ROLES.filter((known) => stored.includes(known));
}

/** An email typed in the backoffice, as a membership key: trimmed and lower-cased. */
export function normaliseStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}
