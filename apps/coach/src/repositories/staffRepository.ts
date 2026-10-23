import type { StaffMember, StaffRole } from "../domain/staff";

/** A staff member to create: their invitation. */
export interface NewStaffMember {
  /** Lower-cased. */
  email: string;
  /** At least one. */
  roles: StaffRole[];
  /** The member who invites them. */
  invitedBy: string;
}

/**
 * Port for the backoffice team (INI-87). A member is a user of the coach app, created at their
 * invitation; their Google account is linked to it on their first sign in. Emails are always
 * passed lower-cased.
 */
export interface StaffRepository {
  /** Every member, oldest invitation first: invited until they first signed in, then active. */
  list(): Promise<StaffMember[]>;
  /** Create the member's user. `false` when a user with this email exists already: nothing is changed. */
  create(member: NewStaffMember): Promise<boolean>;
  /**
   * Delete the member's user, with their sessions and Google account: signed out at once, and
   * they can never sign in again. `false` when no member has this email.
   */
  remove(email: string): Promise<boolean>;
}
