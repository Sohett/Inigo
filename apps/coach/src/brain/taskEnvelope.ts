import type { Athlete } from "../domain/athlete";
import type { OnboardingState } from "../domain/onboarding";

/** What the envelope says about the athlete: who they are, and where and how they live. */
export type EnvelopeAthlete = Pick<Athlete, "id" | "displayName" | "timezone" | "locale">;

/**
 * The athlete's local date and time as `YYYY-MM-DD HH:mm (jour)`, with the French weekday,
 * computed in `timeZone`. This anchors every turn on a real moment so no agent has to guess
 * "what day is today" or whether "ce soir" is still ahead; using the athlete's timezone keeps
 * the day right across midnight. `formatToParts` avoids depending on locale-specific ordering.
 */
export function formatDateTime(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")} (${part("weekday")})`;
}

/**
 * The envelope every turn carries, whichever agent it goes to:
 *  - `date_time`: the athlete's local date and time, in their timezone (see `formatDateTime`);
 *  - `inigo_athlete_id`: our internal athlete UUID (`athlete.id` in Neon), the key the agent
 *    passes to every MCP tool. Deliberately NOT the Intervals.icu athlete id;
 *  - `athlete_display_name`: how to call the athlete, empty while we do not know it yet;
 *  - `locale`: the athlete's language (`fr`);
 *  - then the turn's own lines, and last the `message`, JSON-encoded: quotes and line breaks are
 *    escaped, so whatever the athlete writes stays one line and can never pass for an envelope
 *    line (`inigo_athlete_id: …`).
 *
 * The WhatsApp chat id is deliberately NOT carried: `send_whatsapp_message` resolves it from the
 * athlete. The agents' system prompts explain this envelope. `now` is a parameter so the moment is
 * deterministic under test.
 */
function formatEnvelope(athlete: EnvelopeAthlete, turnLines: string[], text: string, now: Date): string {
  return [
    `date_time: ${formatDateTime(now, athlete.timezone)}`,
    `inigo_athlete_id: ${athlete.id}`,
    `athlete_display_name: ${athlete.displayName ?? ""}`,
    `locale: ${athlete.locale}`,
    ...turnLines,
    `message: ${JSON.stringify(text)}`
  ].join("\n");
}

/** A turn for the coordinator: the envelope and the message, nothing else. */
export function formatTurn(athlete: EnvelopeAthlete, text: string, now: Date = new Date()): string {
  return formatEnvelope(athlete, [], text, now);
}

/**
 * A turn for the onboarding agent (INI-46): the envelope plus where the athlete stands in the
 * onboarding checklist, so the agent asks only what is still missing and picks up where the
 * athlete left off. An empty list stays an empty line, never omitted.
 */
export function formatOnboardingTurn(
  athlete: EnvelopeAthlete,
  state: OnboardingState,
  text: string,
  now: Date = new Date()
): string {
  return formatEnvelope(
    athlete,
    [`onboarding_fait: ${state.done.join(", ")}`, `onboarding_manquant: ${state.missing.join(", ")}`],
    text,
    now
  );
}

/**
 * The line telling the onboarding agent the athlete just connected Intervals.icu from the link
 * (INI-69). Nothing was written: the turn exists so the agent confirms on WhatsApp and moves on
 * without waiting for the athlete to speak.
 */
export const INTERVALS_CONNECTED_LINE = "evenement: intervals_connecte";

/**
 * A turn the athlete did not write: their onboarding checklist, the event line, and an empty
 * `message` (still the last line, so the envelope contract holds).
 */
export function formatIntervalsConnectedTurn(
  athlete: EnvelopeAthlete,
  state: OnboardingState,
  now: Date = new Date()
): string {
  return formatEnvelope(
    athlete,
    [
      `onboarding_fait: ${state.done.join(", ")}`,
      `onboarding_manquant: ${state.missing.join(", ")}`,
      INTERVALS_CONNECTED_LINE
    ],
    "",
    now
  );
}

/**
 * The turn telling the coordinator an active athlete just reconnected Intervals.icu from the link
 * (INI-71), so it confirms and resumes what had failed without waiting for the athlete to write.
 */
export function formatIntervalsReconnectedTurn(athlete: EnvelopeAthlete, now: Date = new Date()): string {
  return formatEnvelope(athlete, [INTERVALS_CONNECTED_LINE], "", now);
}

/** The line telling the coordinator an athlete just finished onboarding (INI-49). */
export const HANDOFF_LINE = "passation: onboarding terminé, planifie la semaine 1";

/**
 * The first turn the coordinator receives for an athlete who just finished onboarding: the
 * envelope with the hand-off line, so the coordinator builds the plan and week 1 instead of only
 * answering. Only this turn carries it.
 */
export function formatHandoffTurn(athlete: EnvelopeAthlete, text: string, now: Date = new Date()): string {
  return formatEnvelope(athlete, [HANDOFF_LINE], text, now);
}
