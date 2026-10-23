import { and, asc, eq } from "drizzle-orm";
import { authUser, staffMember, type Db } from "@inigo/db";
import { StaffStatus, type StaffMember } from "../domain/staff";
import type { StaffRepository } from "./staffRepository";

/** Drizzle adapter for `StaffRepository`, over `staff_member` and the staff users of `auth_user`. */
export function createDrizzleStaffRepository(db: Db): StaffRepository {
  return {
    async isMember(email) {
      const rows = await db
        .select({ email: staffMember.email })
        .from(staffMember)
        .where(eq(staffMember.email, email))
        .limit(1);
      return rows.length > 0;
    },

    async list() {
      const rows = await db
        .select({
          email: staffMember.email,
          roles: staffMember.roles,
          invitedBy: staffMember.invitedBy,
          invitedAt: staffMember.invitedAt,
          name: authUser.name
        })
        .from(staffMember)
        .leftJoin(authUser, and(eq(authUser.email, staffMember.email), eq(authUser.role, "staff")))
        .orderBy(asc(staffMember.invitedAt));
      return rows.map(
        (row): StaffMember => ({
          email: row.email,
          roles: row.roles,
          status: row.name === null ? StaffStatus.Invited : StaffStatus.Active,
          name: row.name === null || row.name === "" ? null : row.name,
          invitedBy: row.invitedBy,
          invitedAt: row.invitedAt
        })
      );
    },

    async invite(email, roles, invitedBy) {
      const rows = await db
        .insert(staffMember)
        .values({ email, roles, invitedBy })
        .onConflictDoNothing()
        .returning({ email: staffMember.email });
      return rows.length > 0;
    },

    async remove(email) {
      // One batch (a single Postgres transaction): never a membership gone with its user left.
      const [removed] = await db.batch([
        db.delete(staffMember).where(eq(staffMember.email, email)).returning({ email: staffMember.email }),
        db.delete(authUser).where(and(eq(authUser.email, email), eq(authUser.role, "staff")))
      ]);
      return removed.length > 0;
    }
  };
}
