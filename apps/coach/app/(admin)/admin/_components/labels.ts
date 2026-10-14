import type { PlanStatus, PropositionStatus } from "@inigo/db";
import type { AthleteStatus } from "@/domain/athlete";
import type { AttentionReason } from "@/use-cases/listAdminAthletes";

/** Shared wording of the admin pages, so the roster and the athlete page say the same thing. */

export const ATHLETE_STATUSES: readonly AthleteStatus[] = ["onboarding", "active", "paused", "ended"];

export const STATUS_LABEL: Record<AthleteStatus, string> = {
  onboarding: "Onboarding",
  active: "Actif",
  paused: "En pause",
  ended: "Terminé"
};

export const STATUS_VARIANT: Record<AthleteStatus, "default" | "secondary" | "outline"> = {
  onboarding: "secondary",
  active: "default",
  paused: "secondary",
  ended: "outline"
};

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  no_active_plan: "Pas de plan actif",
  proposition_pending: "Semaine pas appliquée"
};

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "brouillon",
  active: "actif",
  completed: "terminé",
  archived: "archivé"
};

export const PROPOSITION_STATUS_LABEL: Record<PropositionStatus, string> = {
  draft: "proposée",
  validated: "validée",
  applied: "appliquée",
  rejected: "rejetée"
};

export const DATE_TIME_FORMAT = new Intl.DateTimeFormat("fr-BE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Brussels"
});

export const DATE_FORMAT = new Intl.DateTimeFormat("fr-BE", {
  dateStyle: "short",
  timeZone: "Europe/Brussels"
});

/** A calendar date as stored (`2026-10-12`), shown as `12/10/26` without any timezone shift. */
export function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year?.slice(2)}`;
}

/** How to reach the athlete on WhatsApp: number and LID, whichever are known. */
export function contactOf(athlete: { phoneNum: string | null; whatsappLid: string | null }): string {
  return [athlete.phoneNum, athlete.whatsappLid].filter(Boolean).join(" · ");
}
