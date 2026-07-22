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
 *  - `inigo_athlete_id`: our internal athlete UUID (`athlete.id` in Neon). This is the
 *    key the agent uses to reach the athlete-data MCP (`/athlete/{id}/api/mcp`). It is
 *    deliberately NOT the Intervals.icu athlete id — that one lives in the Intervals MCP.
 *  - `chat_id`: the WhatsApp chat to reply to (via the OpenWA send tool).
 * The agent's system prompt (configured on the control plane) explains this envelope.
 *
 * `now`/`timeZone` are parameters (defaulting to now in `Europe/Brussels`) so the date is
 * deterministic under test; the routing `Athlete` carries no timezone yet, so callers use
 * the default.
 */
export function formatTurn(
  inigoAthleteId: string,
  chatId: string,
  text: string,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  return `date_du_jour: ${formatDateDuJour(now, timeZone)}\ninigo_athlete_id: ${inigoAthleteId}\nchat_id: ${chatId}\nmessage: ${text}`;
}
