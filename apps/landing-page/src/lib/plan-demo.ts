import {
  demoLabels,
  disciplines,
  goals,
  scenarios,
  type Goal,
  type GoalId,
  type Scenario,
  type ScenarioId,
  type Session,
  type Zone,
} from "@/content/demo";

/**
 * Calcul de la démo « Ton plan, en direct » : pour un objectif et un imprévu, le plan jusqu'au
 * jour J (volume par semaine et par zone), la semaine en cours réajustée et la conversation avec
 * le coach. Pur : le même état sert au rendu du build et du navigateur.
 */

export type Phase = "base" | "build" | "specific" | "taper";

/** Semaines d'affûtage avant le jour J, quel que soit l'objectif. */
const TAPER_WEEKS = 2;

/** Part de chaque zone dans le volume d'une semaine, de Z5 (haut de la barre) à Z1 (bas). */
const ZONE_SHARES: Record<Phase, readonly number[]> = {
  base: [0, 0, 0.08, 0.72, 0.2],
  build: [0.02, 0.08, 0.12, 0.6, 0.18],
  specific: [0.05, 0.11, 0.12, 0.55, 0.17],
  taper: [0.04, 0.08, 0.08, 0.5, 0.3],
};
const ZONES_TOP_DOWN: readonly Zone[] = [5, 4, 3, 2, 1];

export type WeekState = "past" | "adjusted" | "future";

export interface WeekBar {
  /** Hauteur de chaque segment, en % de la hauteur du graphique. */
  segments: { zone: Zone; height: number }[];
  label: string;
  state: WeekState;
}

export interface PhaseSpan {
  name: string;
  weeks: number;
}

export interface DayCard extends Session {
  meta: string;
  adjusted: boolean;
}

export interface MessageAttachment {
  text: string;
  zone: Zone;
}

export interface Message {
  side: "in" | "out";
  text: string;
  time: string;
  attachments?: { title: string; items: MessageAttachment[] };
}

export interface PlanDemo {
  goal: Goal;
  scenario: Scenario;
  /** Numéro (1 à N) de la semaine en cours. */
  currentWeek: number;
  weeks: WeekBar[];
  phases: PhaseSpan[];
  days: DayCard[];
  adjustedDays: number;
  messages: Message[];
}

export function planDemo(goalId: GoalId, scenarioId: ScenarioId): PlanDemo {
  const goal = goals.find((candidate) => candidate.id === goalId);
  if (!goal) throw new Error(`Objectif inconnu : ${goalId}`);
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error(`Imprévu inconnu : ${scenarioId}`);

  const discipline = disciplines[goal.discipline];
  const context = { discipline, week: discipline.week };
  const changes = scenario.changes(context);
  const days: DayCard[] = discipline.week.map((planned, index) => {
    const changed = changes.get(index);
    const day = changed ?? planned;
    return { ...day, meta: day.zone === 0 ? demoLabels.rest : `${day.detail} · ${zoneLabel(day.zone)}`, adjusted: changed !== undefined };
  });
  const adjusted = days.filter((day) => day.adjusted);

  const currentIndex = Math.round(goal.weeks * 0.42);
  const messages: Message[] = [
    {
      side: "in",
      text: `${demoLabels.weekPrefix} ${currentIndex + 1} : ${discipline.plan}`,
      time: demoLabels.times.plan,
      attachments: {
        title: demoLabels.keySessions,
        items: [1, 3, 5].flatMap((index) => {
          const day = discipline.week[index];
          return day ? [attachment(day)] : [];
        }),
      },
    },
    { side: "out", text: scenario.athlete(context), time: demoLabels.times.athlete },
    {
      side: "in",
      text: scenario.coach(context),
      time: demoLabels.times.coach,
      attachments: { title: demoLabels.updatedWeek, items: adjusted.map(attachment) },
    },
  ];

  const { weeks, phases } = buildPlan(goal.weeks, currentIndex, scenario);
  return { goal, scenario, currentWeek: currentIndex + 1, weeks, phases, days, adjustedDays: adjusted.length, messages };
}

function zoneLabel(zone: Zone): string {
  return `${demoLabels.zonePrefix}${zone}`;
}

function attachment(day: Session): MessageAttachment {
  const zone = day.zone === 0 ? "" : ` · ${zoneLabel(day.zone)}`;
  return { text: `${day.day} · ${day.title}${zone}`.toUpperCase(), zone: day.zone };
}

function buildPlan(total: number, currentIndex: number, scenario: Scenario): { weeks: WeekBar[]; phases: PhaseSpan[] } {
  const base = Math.round(total * 0.35);
  const build = Math.round(total * 0.3);
  const peak = total - TAPER_WEEKS;
  const specific = peak - base - build;

  const phaseOf = (index: number): Phase => {
    if (index < base) return "base";
    if (index < base + build) return "build";
    if (index < peak) return "specific";
    return "taper";
  };

  const weeks: WeekBar[] = [];
  for (let index = 0; index < total; index++) {
    const phase = phaseOf(index);
    const volume = weekVolume(index, phase, peak, currentIndex, scenario);
    const shares = ZONE_SHARES[phase];
    const segments = ZONES_TOP_DOWN.flatMap((zone, position) => {
      const height = Math.round(volume * (shares[position] ?? 0) * 1000) / 10;
      return height > 0 ? [{ zone, height }] : [];
    });
    weeks.push({ segments, label: weekLabel(index, currentIndex), state: weekState(index, currentIndex) });
  }

  return {
    weeks,
    phases: [
      { name: demoLabels.phases.base, weeks: base },
      { name: demoLabels.phases.build, weeks: build },
      { name: demoLabels.phases.specific, weeks: specific },
      { name: demoLabels.phases.taper, weeks: TAPER_WEEKS },
    ],
  };
}

/** Volume relatif (0 à 1) : montée progressive, semaine allégée toutes les 4, affûtage à la fin. */
function weekVolume(index: number, phase: Phase, peak: number, currentIndex: number, scenario: Scenario): number {
  if (phase === "taper") return index === peak ? 0.68 : 0.42;

  let volume = 0.42 + 0.58 * (index / Math.max(1, peak - 1));
  if (index % 4 === 3) volume *= 0.72;
  if (index === currentIndex) return Math.min(1, volume * scenario.volume);

  switch (scenario.id) {
    case "in-shape":
      return index > currentIndex ? Math.min(1, volume * 1.04) : volume;
    case "missed-session":
      return index === currentIndex + 1 ? volume * 0.9 : volume;
    case "bad-night":
    case "business-trip":
    case "rain":
      return volume;
  }
}

function weekLabel(index: number, currentIndex: number): string {
  if (index === currentIndex) return demoLabels.adjustedWeek;
  return index === 0 || (index + 1) % 4 === 0 ? `${demoLabels.weekShort}${index + 1}` : "";
}

function weekState(index: number, currentIndex: number): WeekState {
  if (index < currentIndex) return "past";
  if (index > currentIndex) return "future";
  return "adjusted";
}
