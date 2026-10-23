import { UUID_PATTERN } from "../mcp/athleteId";

/**
 * The email of an athlete's Better Auth user (INI-85). Better Auth keys every user by email, and
 * an athlete has none: WhatsApp is their only identity. So their email is derived from
 * `athlete.id`, on `.invalid`, a domain reserved never to resolve (RFC 2606): no mail can ever
 * be sent to it, and no Google account can ever carry it.
 */
const ATHLETE_EMAIL_DOMAIN = "athletes.inigo.invalid";

export function athleteEmail(athleteId: string): string {
  return `${athleteId.toLowerCase()}@${ATHLETE_EMAIL_DOMAIN}`;
}

/** The athlete behind a Better Auth email, or null when it is not an athlete's (a coach's). */
export function athleteIdOf(email: string): string | null {
  const [local, domain, extra] = email.toLowerCase().split("@");
  if (!local || domain !== ATHLETE_EMAIL_DOMAIN || extra !== undefined) return null;
  return UUID_PATTERN.test(local) ? local : null;
}
