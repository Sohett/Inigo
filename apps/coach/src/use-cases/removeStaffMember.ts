import { normaliseStaffEmail } from "../domain/staff";
import type { StaffRepository } from "../repositories/staffRepository";

export type RemoveStaffOutcome =
  | { status: "removed" }
  | { status: "not_member" }
  /** A member never removes themselves: the last one would lock everyone out of the backoffice. */
  | { status: "cannot_remove_yourself" };

export interface RemoveStaffMember {
  execute(email: string, removedBy: string): Promise<RemoveStaffOutcome>;
}

/**
 * Take the backoffice away from a member, or withdraw an invitation (INI-85, INI-87): their user is
 * deleted, with their sessions and Google account, so they are signed out at once and can never
 * sign in again.
 */
export function createRemoveStaffMember(deps: { staff: Pick<StaffRepository, "remove"> }): RemoveStaffMember {
  return {
    async execute(email, removedBy) {
      const removed = normaliseStaffEmail(email);
      if (removed === normaliseStaffEmail(removedBy)) return { status: "cannot_remove_yourself" };
      return (await deps.staff.remove(removed)) ? { status: "removed" } : { status: "not_member" };
    }
  };
}
