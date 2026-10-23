import { normaliseStaffEmail, STAFF_ROLES, type StaffRole } from "../domain/staff";
import type { StaffRepository } from "../repositories/staffRepository";

export type InviteStaffOutcome =
  | { status: "invited"; email: string }
  | { status: "already_member"; email: string }
  /** A member has at least one role. */
  | { status: "no_role" };

export interface InviteStaffMember {
  /** `email` is already a valid address (checked at the route); `invitedBy` the inviting member's. */
  execute(email: string, roles: readonly StaffRole[], invitedBy: string): Promise<InviteStaffOutcome>;
}

/**
 * Let someone into the backoffice (INI-85, INI-87), as admin, coach or both. Inviting them is
 * creating their user: the first time they sign in with the Google account of that email, it is
 * linked to this user. Nothing is sent: the inviting member copies the sign in link for them.
 */
export function createInviteStaffMember(deps: { staff: Pick<StaffRepository, "create"> }): InviteStaffMember {
  return {
    async execute(email, roles, invitedBy) {
      // Deduplicated and in a stable order, whatever the form sent.
      const kept = STAFF_ROLES.filter((role) => roles.includes(role));
      if (kept.length === 0) return { status: "no_role" };
      const invited = normaliseStaffEmail(email);
      const created = await deps.staff.create({ email: invited, roles: kept, invitedBy: normaliseStaffEmail(invitedBy) });
      return { status: created ? "invited" : "already_member", email: invited };
    }
  };
}
