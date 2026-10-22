import type { DayCard, Message, PhaseSpan, WeekBar } from "@/lib/plan-demo";

/**
 * Rendus HTML des parties dynamiques de la démo. Les mêmes fonctions servent au build
 * (`set:html`, la page est complète sans JS) et au navigateur (bascule d'imprévu ou d'objectif).
 * Couleurs de zone : classes `.zone-<n>` de `global.css`.
 */

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ENTITIES[character] ?? character);
}

export function renderMessages(messages: readonly Message[]): string {
  return messages
    .map((message) => {
      const attachments = message.attachments?.items.length
        ? `<div class="att"><span class="att-title">${escapeHtml(message.attachments.title)}</span>${message.attachments.items
            .map((item) => `<div><i class="zone-${item.zone}"></i>${escapeHtml(item.text)}</div>`)
            .join("")}</div>`
        : "";
      return `<div class="bub ${message.side}">${escapeHtml(message.text)}${attachments}<time>${escapeHtml(message.time)}</time></div>`;
    })
    .join("");
}

export function renderWeeks(weeks: readonly WeekBar[]): string {
  return weeks
    .map(
      (week) =>
        `<div class="plan-week is-${week.state}"><div class="plan-bar">${week.segments
          .map((segment) => `<div class="zone-${segment.zone}" style="height:${segment.height}%"></div>`)
          .join("")}</div><span class="mono plan-week-label">${escapeHtml(week.label)}</span></div>`,
    )
    .join("");
}

export function renderPhases(phases: readonly PhaseSpan[]): string {
  return phases
    .map((phase) => `<div class="plan-phase" style="grid-column:span ${phase.weeks}"><span class="mono">${escapeHtml(phase.name)}</span></div>`)
    .join("");
}

export function renderDays(days: readonly DayCard[], adjustedBadge: string): string {
  return days
    .map(
      (day) =>
        `<div class="plan-day${day.adjusted ? " is-adjusted" : ""}"><div class="plan-day-head"><span class="mono ink">${escapeHtml(day.day)}</span><span class="mono">${escapeHtml(day.sport)}</span></div><div class="plan-day-bar zone-${day.zone}"></div><b>${escapeHtml(day.title)}</b><span class="mono">${escapeHtml(day.meta)}</span>${
          day.adjusted ? `<span class="plan-day-badge">${escapeHtml(adjustedBadge)}</span>` : ""
        }</div>`,
    )
    .join("");
}
