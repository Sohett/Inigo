import type { Coach } from "../domain/coach";

/**
 * Port for the coaches who can open the admin (INI-85): their invitations and, once they signed
 * in, their Better Auth user. Emails are always passed lower-cased.
 */
export interface CoachRepository {
  /** Whether this email may become a coach: Better Auth asks before creating a Google user. */
  isInvited(email: string): Promise<boolean>;
  /** Every invited coach, active or not, oldest invitation first. */
  list(): Promise<Coach[]>;
  /** Invite this email. `false` when it already was: nothing is changed. */
  invite(email: string, invitedBy: string): Promise<boolean>;
  /**
   * Take the admin away from this email: the invitation and the coach user go together, so their
   * sessions end at once (cascade) and Google can never sign them up again. `false` when the
   * email was not invited.
   */
  remove(email: string): Promise<boolean>;
}
