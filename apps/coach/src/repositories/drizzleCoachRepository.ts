import { and, asc, eq } from "drizzle-orm";
import { authUser, coachInvitation, type Db } from "@inigo/db";
import { CoachStatus, type Coach } from "../domain/coach";
import type { CoachRepository } from "./coachRepository";

/** Drizzle adapter for `CoachRepository`, over `coach_invitation` and the coaches of `auth_user`. */
export function createDrizzleCoachRepository(db: Db): CoachRepository {
  return {
    async isInvited(email) {
      const rows = await db
        .select({ email: coachInvitation.email })
        .from(coachInvitation)
        .where(eq(coachInvitation.email, email))
        .limit(1);
      return rows.length > 0;
    },

    async list() {
      const rows = await db
        .select({
          email: coachInvitation.email,
          invitedBy: coachInvitation.invitedBy,
          invitedAt: coachInvitation.createdAt,
          name: authUser.name
        })
        .from(coachInvitation)
        .leftJoin(authUser, and(eq(authUser.email, coachInvitation.email), eq(authUser.role, "coach")))
        .orderBy(asc(coachInvitation.createdAt));
      return rows.map(
        (row): Coach => ({
          email: row.email,
          status: row.name === null ? CoachStatus.Invited : CoachStatus.Active,
          name: row.name === null || row.name === "" ? null : row.name,
          invitedBy: row.invitedBy,
          invitedAt: row.invitedAt
        })
      );
    },

    async invite(email, invitedBy) {
      const rows = await db
        .insert(coachInvitation)
        .values({ email, invitedBy })
        .onConflictDoNothing()
        .returning({ email: coachInvitation.email });
      return rows.length > 0;
    },

    async remove(email) {
      // One batch (a single Postgres transaction): never an invitation gone with its user left.
      const [removed] = await db.batch([
        db.delete(coachInvitation).where(eq(coachInvitation.email, email)).returning({ email: coachInvitation.email }),
        db.delete(authUser).where(and(eq(authUser.email, email), eq(authUser.role, "coach")))
      ]);
      return removed.length > 0;
    }
  };
}
