/**
 * The email of an athlete's Better Auth user (INI-85). Better Auth keys every user by email, and
 * an athlete has none: WhatsApp is their only identity. So their email is made from `athlete.id`,
 * on a domain that is only a label for Better Auth: no mail is ever sent to it.
 *
 * One way only: the athlete behind a user is `auth_user.athlete_id`, a foreign key, never read
 * back from this email.
 */
const ATHLETE_EMAIL_DOMAIN = "athletes.inigo.betterauth";

export function athleteEmail(athleteId: string): string {
  return `${athleteId.toLowerCase()}@${ATHLETE_EMAIL_DOMAIN}`;
}
