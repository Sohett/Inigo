import { normaliseCoachEmail } from "../domain/coach";
import type { CoachRepository } from "../repositories/coachRepository";

export type InviteCoachOutcome = { status: "invited"; email: string } | { status: "already_invited"; email: string };

export interface InviteCoach {
  /** `email` is already a valid address (checked at the route); `invitedBy` the inviting coach's. */
  execute(email: string, invitedBy: string): Promise<InviteCoachOutcome>;
}

/**
 * Let another coach into the admin (INI-85): their email is invited, and the first time they sign
 * in with that Google account, Better Auth makes them a coach. Nothing is sent: the inviting coach
 * tells them where to sign in.
 */
export function createInviteCoach(deps: { coaches: Pick<CoachRepository, "invite"> }): InviteCoach {
  return {
    async execute(email, invitedBy) {
      const invited = normaliseCoachEmail(email);
      const created = await deps.coaches.invite(invited, normaliseCoachEmail(invitedBy));
      return { status: created ? "invited" : "already_invited", email: invited };
    }
  };
}
