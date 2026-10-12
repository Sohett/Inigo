import type { OnboardingState } from "../domain/onboarding";

/** Fallback timezone when the athlete's own timezone isn't known at the call site. */
const DEFAULT_TIMEZONE = "Europe/Brussels";

/**
 * The athlete's local calendar day as `YYYY-MM-DD (jour)`, with the French weekday,
 * computed in `timeZone`. This anchors every turn on a real date so no agent has to
 * guess "what day is today"; using the athlete's timezone keeps the day correct across
 * the midnight boundary. `formatToParts` avoids depending on locale-specific ordering.
 */
export function formatDateDuJour(now: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} (${part("weekday")})`;
}

/**
 * Format a turn the coordinator agent can act on. The envelope carries:
 *  - `date_du_jour`: the athlete's local day (`YYYY-MM-DD (jour)`) — the coordinator's
 *    temporal anchor so it never guesses today's date, and which it relays to specialists.
 *  - `inigo_athlete_id`: our internal athlete UUID (`athlete.id` in Neon). This is the key
 *    the agent passes to every MCP server (`/api/coaching-data/mcp`, `/api/intervals/mcp`,
 *    `/api/whatsapp/mcp`). It is deliberately NOT the Intervals.icu athlete id — that one
 *    lives behind the Intervals MCP.
 *
 * The WhatsApp chat id is deliberately NOT carried here: `send_whatsapp_message` resolves it
 * from the athlete, so the agent never handles a chat id or a gateway session id.
 * The agent's system prompt (configured on the control plane) explains this envelope.
 *
 * `now`/`timeZone` are parameters (defaulting to now in `Europe/Brussels`) so the date is
 * deterministic under test; the routing `Athlete` carries no timezone yet, so callers use
 * the default.
 */
export function formatTurn(
  inigoAthleteId: string,
  text: string,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  return `date_du_jour: ${formatDateDuJour(now, timeZone)}\ninigo_athlete_id: ${inigoAthleteId}\nmessage: ${text}`;
}

/**
 * Format a turn for the onboarding agent (INI-46): the same envelope as `formatTurn`, plus where
 * the athlete stands in the onboarding checklist, so the agent asks only what is still missing and
 * picks up where the athlete left off. An empty list stays an empty line, never omitted.
 */
export function formatOnboardingTurn(
  inigoAthleteId: string,
  state: OnboardingState,
  text: string,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  return [
    `date_du_jour: ${formatDateDuJour(now, timeZone)}`,
    `inigo_athlete_id: ${inigoAthleteId}`,
    `onboarding_fait: ${state.done.join(", ")}`,
    `onboarding_manquant: ${state.missing.join(", ")}`,
    `message: ${text}`
  ].join("\n");
}

/** The line telling the coordinator an athlete just finished onboarding (INI-49). */
export const HANDOFF_LINE = "passation: onboarding terminé, planifie la semaine 1";

/**
 * Format the first turn the coordinator receives for an athlete who just finished onboarding:
 * the `formatTurn` envelope with the hand-off line before the message, so the coordinator builds
 * the plan and week 1 instead of only answering. Only this turn carries it.
 */
export function formatHandoffTurn(
  inigoAthleteId: string,
  text: string,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  return [
    `date_du_jour: ${formatDateDuJour(now, timeZone)}`,
    `inigo_athlete_id: ${inigoAthleteId}`,
    HANDOFF_LINE,
    `message: ${text}`
  ].join("\n");
}
