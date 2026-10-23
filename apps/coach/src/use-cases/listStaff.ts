import type { StaffMember } from "../domain/staff";
import type { StaffRepository } from "../repositories/staffRepository";

export interface ListStaff {
  execute(): Promise<StaffMember[]>;
}

/** The backoffice team (INI-85): every member, signed in yet or not. */
export function createListStaff(deps: { staff: Pick<StaffRepository, "list"> }): ListStaff {
  return {
    async execute() {
      return deps.staff.list();
    }
  };
}
