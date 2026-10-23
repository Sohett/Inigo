import type { StaffMember, StaffRole } from "../domain/staff";

/**
 * Port for the backoffice team (INI-85): its members (invitation and roles) and, once they signed
 * in, their Better Auth user. Emails are always passed lower-cased.
 */
export interface StaffRepository {
  /** Whether this email is a member: Better Auth asks before creating a Google user. */
  isMember(email: string): Promise<boolean>;
  /** Every member, active or invited, oldest invitation first. */
  list(): Promise<StaffMember[]>;
  /** Invite this email with these roles. `false` when it already was a member: nothing is changed. */
  invite(email: string, roles: StaffRole[], invitedBy: string): Promise<boolean>;
  /**
   * Take the backoffice away from this email: the membership and the staff user go together, so
   * their sessions end at once (cascade) and Google can never sign them up again. `false` when
   * the email was not a member.
   */
  remove(email: string): Promise<boolean>;
}
