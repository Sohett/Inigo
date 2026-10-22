/**
 * Contenu de la démo interactive (hero + « Ton plan, en direct ») : objectifs, imprévus,
 * semaines types par discipline et textes de la conversation. La mécanique (quelles séances
 * bougent, volumes, phases) vit dans `lib/plan-demo.ts`.
 *
 * Règle de style : aucun tiret « - » ni tiret cadratin « — » dans le texte visible.
 */

/** 0 = repos, 1 à 5 = zones d'intensité. */
export type Zone = 0 | 1 | 2 | 3 | 4 | 5;

export interface Session {
  day: string;
  sport: string;
  title: string;
  detail: string;
  zone: Zone;
}

export type Discipline = "triathlon" | "bike" | "run";

interface DisciplineContent {
  /** Semaine type, lundi à dimanche. Index 1 = séance clé du mardi, 5 = sortie longue du samedi. */
  week: readonly Session[];
  /** Fin du message du lundi : « Semaine 9 : <plan> ». */
  plan: string;
  /** Cible ratée dans l'imprévu « Séance ratée ». */
  missedTarget: string;
  /** Durée de la sortie longue, pour l'imprévu « Pluie samedi ». */
  longSession: string;
  /** Support d'intérieur, pour l'imprévu « Pluie samedi ». */
  indoor: string;
  /** Séance clé allongée, pour l'imprévu « En pleine forme ». */
  harderKeySession: string;
  /** Réponse du coach à « En pleine forme ». */
  inShape: string;
}

const session = (day: string, sport: string, title: string, detail: string, zone: Zone): Session => ({
  day,
  sport,
  title,
  detail,
  zone,
});

export const disciplines: Record<Discipline, DisciplineContent> = {
  triathlon: {
    week: [
      session("Lun", "Natation", "Technique", "45 MIN", 2),
      session("Mar", "Vélo", "Sweet spot", "3×12 MIN", 3),
      session("Mer", "Course", "Footing", "50 MIN", 2),
      session("Jeu", "Natation", "Seuil", "10×100 M", 4),
      session("Ven", "Repos", "Repos", "", 0),
      session("Sam", "Vélo", "Sortie longue", "3 H", 2),
      session("Dim", "Enchaîné", "Vélo + course", "1H30", 3),
    ],
    plan: "sweet spot mardi, seuil en natation jeudi, 3 h de vélo samedi et un enchaînement dimanche.",
    missedTarget: "250 W",
    longSession: "3 h de vélo",
    indoor: "Home trainer",
    harderKeySession: "3×15 MIN",
    inShape:
      "Ça se voit : 252 W à 146 bpm, 6 bpm de moins qu'il y a 4 semaines. Je remonte ton FTP à 268 W et tes zones suivent.",
  },
  bike: {
    week: [
      session("Lun", "Repos", "Repos", "", 0),
      session("Mar", "Vélo", "Sweet spot", "3×12 MIN", 3),
      session("Mer", "Vélo", "Récupération", "1 H", 1),
      session("Jeu", "Vélo", "VO2max", "5×4 MIN", 5),
      session("Ven", "Repos", "Repos", "", 0),
      session("Sam", "Vélo", "Sortie longue", "4 H · 1 800 M D+", 2),
      session("Dim", "Vélo", "Endurance", "2 H", 2),
    ],
    plan: "sweet spot mardi, VO2max jeudi, 4 h samedi avec du dénivelé et 2 h faciles dimanche.",
    missedTarget: "280 W",
    longSession: "4 h",
    indoor: "Home trainer",
    harderKeySession: "3×15 MIN",
    inShape:
      "Ça se voit : 276 W à 149 bpm, 5 bpm de moins qu'il y a 4 semaines. Je remonte ton FTP à 292 W et tes zones suivent.",
  },
  run: {
    week: [
      session("Lun", "Repos", "Repos", "", 0),
      session("Mar", "Course", "Tempo", "3×10 MIN", 3),
      session("Mer", "Course", "Footing", "40 MIN", 1),
      session("Jeu", "Course", "Seuil", "4×8 MIN", 4),
      session("Ven", "Repos", "Repos", "", 0),
      session("Sam", "Course", "Sortie longue", "1H45", 2),
      session("Dim", "Vélo", "Récupération", "1 H", 1),
    ],
    plan: "tempo mardi, seuil jeudi, sortie longue samedi et une heure de vélo facile dimanche.",
    missedTarget: "4:20 /km",
    longSession: "1 h 45",
    indoor: "Tapis",
    harderKeySession: "3×12 MIN",
    inShape:
      "Ça se voit : 4:18 /km à 162 bpm, 5 bpm de moins qu'il y a 4 semaines. Ton allure seuil passe à 4:15 /km.",
  },
};

export type GoalId = "triathlon-l" | "triathlon-m" | "cyclo" | "gravel" | "marathon";

export interface Goal {
  id: GoalId;
  label: string;
  race: string;
  discipline: Discipline;
  weeks: number;
  target: string;
  format: string;
  hours: string;
}

export const goals: readonly Goal[] = [
  { id: "triathlon-l", label: "Triathlon L", race: "Triathlon distance L", discipline: "triathlon", weeks: 20, target: "5h30", format: "1,9 · 90 · 21,1 km", hours: "7 à 11 h / sem." },
  { id: "triathlon-m", label: "Triathlon M", race: "Triathlon distance M", discipline: "triathlon", weeks: 12, target: "2h30", format: "1,5 · 40 · 10 km", hours: "5 à 8 h / sem." },
  { id: "cyclo", label: "Cyclo montagne", race: "Cyclosportive de montagne", discipline: "bike", weeks: 16, target: "Sous 7 h", format: "170 km · 4 000 m D+", hours: "6 à 10 h / sem." },
  { id: "gravel", label: "Gravel 100 km", race: "Gravel 100 km", discipline: "bike", weeks: 12, target: "Finir fort", format: "100 km · 1 500 m D+", hours: "5 à 8 h / sem." },
  { id: "marathon", label: "Marathon", race: "Marathon", discipline: "run", weeks: 16, target: "3h30", format: "42,2 km", hours: "4 à 7 h / sem." },
];

export type ScenarioId = "bad-night" | "business-trip" | "missed-session" | "rain" | "in-shape";

/** Ce que les textes d'un imprévu peuvent citer de la semaine en cours. */
export interface ScenarioContext {
  discipline: DisciplineContent;
  /** Semaine telle que planifiée lundi (index 0 = lundi). */
  week: readonly Session[];
}

/** Séances réécrites par le coach, par index de jour (0 = lundi). */
export type WeekChanges = ReadonlyMap<number, Session>;

export interface Scenario {
  id: ScenarioId;
  label: string;
  /** Facteur appliqué au volume de la semaine en cours. */
  volume: number;
  athlete: (context: ScenarioContext) => string;
  coach: (context: ScenarioContext) => string;
  changes: (context: ScenarioContext) => WeekChanges;
}

/** Jour `index` de la semaine planifiée ; les semaines types ont toujours 7 jours. */
function plannedDay(week: readonly Session[], index: number): Session {
  const day = week[index];
  if (!day) throw new Error(`Semaine type incomplète : pas de jour ${index}`);
  return day;
}

export const scenarios: readonly Scenario[] = [
  {
    id: "bad-night",
    label: "Mauvaise nuit",
    volume: 0.88,
    athlete: () => "Nuit pourrie, 4 h de sommeil. Je fais quand même ma séance ?",
    coach: ({ week }) =>
      `Non. Ta VFC est basse ce matin. Aujourd'hui 1 h facile en Z2, et ta séance ${plannedDay(week, 1).title.toLowerCase()} passe à jeudi.`,
    changes: ({ week }) =>
      new Map([
        [1, { ...plannedDay(week, 1), title: "Endurance", detail: "1 H", zone: 2 }],
        [3, { ...plannedDay(week, 1), day: "Jeu" }],
      ]),
  },
  {
    id: "business-trip",
    label: "Déplacement pro",
    volume: 0.85,
    athlete: () => "Déplacement pro mercredi et jeudi. Je fais comment ?",
    coach: () =>
      "Pas de souci. Mercredi 45 min de course à l'hôtel, jeudi repos. On récupère le volume samedi avec 30 min de plus.",
    changes: ({ week }) =>
      new Map([
        [2, session("Mer", "Course", "Footing hôtel", "45 MIN", 2)],
        [3, session("Jeu", "Repos", "Repos", "", 0)],
        [5, { ...plannedDay(week, 5), detail: `${plannedDay(week, 5).detail} + 30 MIN` }],
      ]),
  },
  {
    id: "missed-session",
    label: "Séance ratée",
    volume: 0.78,
    athlete: ({ discipline }) => `J'ai explosé au 3e bloc, impossible de tenir ${discipline.missedTarget}.`,
    coach: () =>
      "J'ai regardé ta séance : ta FC était 8 bpm plus haute que d'habitude dès l'échauffement. C'est de la fatigue accumulée, pas un manque de forme. On allège jeudi et dimanche, test dans 10 jours.",
    changes: ({ week }) => {
      const thursday = plannedDay(week, 3);
      return new Map([
        [3, { ...thursday, sport: thursday.zone === 0 ? "Vélo" : thursday.sport, title: "Récupération", detail: "45 MIN", zone: 1 }],
        [6, { ...plannedDay(week, 6), detail: "1 H", zone: 2 }],
      ]);
    },
  },
  {
    id: "rain",
    label: "Pluie samedi",
    volume: 1,
    athlete: () => "Pluie annoncée samedi. Je fais la sortie longue en intérieur ?",
    coach: ({ discipline }) =>
      `${discipline.longSession} en intérieur, c'est long et peu utile. On inverse : sortie longue dimanche au sec, samedi 1 h 15 en Z2 sur ${discipline.indoor.toLowerCase()}.`,
    changes: ({ discipline, week }) =>
      new Map([
        [5, session("Sam", discipline.indoor, "Endurance", "1H15", 2)],
        [6, { ...plannedDay(week, 5), day: "Dim" }],
      ]),
  },
  {
    id: "in-shape",
    label: "En pleine forme",
    volume: 1.06,
    athlete: () => "Je me sens en feu cette semaine !",
    coach: ({ discipline }) => discipline.inShape,
    changes: ({ discipline, week }) => new Map([[1, { ...plannedDay(week, 1), detail: discipline.harderKeySession }]]),
  },
];

/** Libellés fixes de la démo (conversation et graphique). */
export const demoLabels = {
  keySessions: "SÉANCES CLÉS",
  updatedWeek: "SEMAINE MISE À JOUR",
  weekPrefix: "Semaine",
  rest: "Récupération",
  currentWeek: "ICI",
  adjustedWeek: "AJUSTÉE",
  phases: { base: "Base", build: "Construction", specific: "Spécifique", taper: "Affûtage" },
  times: { plan: "07:00", athlete: "07:12", coach: "07:13" },
} as const;
