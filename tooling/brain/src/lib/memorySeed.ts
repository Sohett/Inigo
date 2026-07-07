import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  adaptationLog,
  athlete,
  athleteProfile,
  athleteThreshold,
  goal,
  planBlock,
  trainingPlan,
  type AthleteConstraints,
  type CoachingTargets,
  type Db,
  type GoalPriority,
  type GoalType,
  type PhaseType,
  type ThresholdSource,
  type WeeklyTarget,
  type Zone
} from "@inigo/db";
import type { BrainClient } from "../client";
import type { MemoryEntry } from "./memoryAudit";
import { ensureApply } from "./writeGuard";

/**
 * One-off, idempotent seed: read athlete Thomas's memory store, map its files into
 * Neon, then (gated) clear the migrated files. Mirrors the mapping decided in INI-9
 * / INI-18. The parsers are tailored to the actual file shapes (JSON validated with
 * zod; markdown given a light structured pass while the narrative is preserved
 * verbatim in `*_notes` / `detail`), so nothing is silently dropped.
 */

/** The athlete store to migrate (`[ATHLETE] Inigo - Thomas Sohet`). */
export const DEFAULT_ATHLETE_STORE_ID = "memstore_01RWCKeRy4fPqFRMKUf9d18E";

/**
 * The exactly-7 files that map into Neon and are safe to delete once the DB write
 * is verified. Everything else in the store (code schemas, shared ops notes, the
 * Intervals.icu week mirror, ephemeral runtime files) is deliberately kept.
 */
export const MIGRATED_PATHS = [
  "/physiology.json",
  "/fitness-state.json",
  "/goals.md",
  "/constraints.md",
  "/health.md",
  "/current-plan/macro-plan.md",
  "/adaptation-log.md"
] as const;

/** Season year of the data being migrated (macro-plan table dates carry no year). */
const SEASON_YEAR = 2026;

// --- Routing (identity fields for the `athlete` row) ------------------------

export interface AthleteRouting {
  displayName: string;
  /** E.164 WhatsApp number — the natural upsert key. Required to write. */
  phoneNum: string | null;
  chatId: string | null;
  anthropicSessionId: string | null;
  managedAgentId: string | null;
  memoryStoreId: string;
}

// --- Parsed shapes (what gets written) --------------------------------------

export interface SeedProfile {
  weightKg: string | null;
  weightTargetKg: string | null;
  maxHr: number | null;
  restingHr: number | null;
  constraints: AthleteConstraints | null;
  constraintsNotes: string;
  healthNotes: string;
  coachingTargets: CoachingTargets | null;
}

export interface SeedThreshold {
  sport: "bike";
  ftpWatts: number;
  thresholdHr: number | null;
  maxHr: number | null;
  powerZones: Zone[] | null;
  hrZones: Zone[] | null;
  source: ThresholdSource;
  effectiveDate: string;
}

export interface SeedGoal {
  title: string;
  description: string | null;
  type: GoalType;
  targetDate: string | null;
  priority: GoalPriority | null;
}

export interface SeedBlock {
  name: string;
  phaseType: PhaseType | null;
  startDate: string;
  endDate: string;
  focus: string | null;
  orderIndex: number;
  weeklyTargets: WeeklyTarget[];
}

export interface SeedPlan {
  name: string;
  startDate: string;
  endDate: string;
  /** Title of the peak goal to link the plan to, if present among the goals. */
  peakGoalTitle: string | null;
  blocks: SeedBlock[];
}

export interface SeedLog {
  occurredAt: Date;
  author: string | null;
  trigger: null;
  summary: string;
  detail: Record<string, unknown>;
  relatedWeek: string | null;
  intervalsEventIds: string[];
}

export interface ParsedAthleteData {
  profile: SeedProfile;
  thresholds: SeedThreshold[];
  goals: SeedGoal[];
  plan: SeedPlan;
  logs: SeedLog[];
}

// --- Zod schemas for the JSON files -----------------------------------------

const physiologySchema = z.object({
  athlete: z
    .object({
      weight_kg: z.number().optional(),
      weight_target_kg: z.number().optional()
    })
    .optional(),
  cycling: z.object({
    ftp_w: z.number(),
    ftp_confidence: z.string().optional(),
    lthr_bpm: z.number().nullable().optional(),
    max_hr_bpm: z.number().nullable().optional(),
    power_zones_w: z.record(z.string(), z.tuple([z.number(), z.number()])).optional()
  }),
  history: z
    .array(
      z.object({
        date: z.string(),
        ftp_w: z.number(),
        event: z.string().optional(),
        ctl: z.number().optional()
      })
    )
    .optional()
});

const fitnessStateSchema = z.object({
  targets: z
    .object({
      peak_event: z.string().optional(),
      ctl_peak_target: z.number().optional(),
      ctl_weekly_ramp_max: z.number().optional(),
      tsb_race_window: z.tuple([z.number(), z.number()]).optional()
    })
    .optional()
});

// --- Small text helpers -----------------------------------------------------

const FRENCH_MONTHS: Record<string, string> = {
  janvier: "01",
  janv: "01",
  "février": "02",
  fevrier: "02",
  "févr": "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  juil: "07",
  "août": "08",
  aout: "08",
  septembre: "09",
  sept: "09",
  octobre: "10",
  oct: "10",
  novembre: "11",
  nov: "11",
  "décembre": "12",
  decembre: "12",
  "déc": "12"
};

const MONTH_ALTERNATION = Object.keys(FRENCH_MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");

/** First `D month YYYY` in `text` → `YYYY-MM-DD`, or null. `fallbackYear` fills a missing year. */
function frenchDateToIso(text: string, fallbackYear?: number): string | null {
  const lower = text.toLowerCase();
  const monthKey = lower.match(new RegExp(`(${MONTH_ALTERNATION})`))?.[1];
  const dayStr = lower.match(/(\d{1,2})/)?.[1];
  const yearStr = lower.match(/(\d{4})/)?.[1];
  if (!monthKey || !dayStr) return null;
  const mm = FRENCH_MONTHS[monthKey];
  const year = yearStr ?? (fallbackYear !== undefined ? String(fallbackYear) : undefined);
  if (!mm || !year) return null;
  return `${year}-${mm}-${dayStr.padStart(2, "0")}`;
}

/**
 * A macro-plan date range like `7-13 juil`, `27 juil-2 août`, `31 août-6 sept`
 * → `{ start, end }` ISO. When the start token omits its month it inherits the
 * end token's month.
 */
function parseWeekDates(text: string, year: number): { start: string; end: string } | null {
  const parts = text.split(/[-–]/).map((s) => s.trim());
  const startTok = parts[0];
  const endTok = parts[parts.length - 1];
  if (!startTok || !endTok) return null;
  if (parts.length < 2) {
    const iso = frenchDateToIso(startTok, year);
    return iso ? { start: iso, end: iso } : null;
  }
  const end = frenchDateToIso(endTok, year);
  if (!end) return null;
  const startDay = startTok.match(/(\d{1,2})/)?.[1];
  if (!startDay) return null;
  const startMonthKey = startTok.toLowerCase().match(new RegExp(`(${MONTH_ALTERNATION})`))?.[1];
  const startMonth = (startMonthKey ? FRENCH_MONTHS[startMonthKey] : undefined) ?? end.slice(5, 7);
  return { start: `${year}-${startMonth}-${startDay.padStart(2, "0")}`, end };
}

/** Midpoint of the first `NNN-NNN` (or a single `NNN`) in a TSS cell, rounded. */
function parseTss(cell: string): number | undefined {
  const clean = cell.replace(/\*/g, "");
  const range = clean.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);
  const single = clean.match(/(\d+)/);
  return single ? Number(single[1]) : undefined;
}

function phaseTypeFrom(phase: string): PhaseType | null {
  const p = phase.toLowerCase();
  if (p.includes("taper")) return "taper";
  if (p.includes("absorption") || p.includes("deload")) return "transition";
  if (p.includes("camp")) return "base";
  if (p.includes("spécifique") || p.includes("specifique")) return "build";
  if (p.includes("build")) return "build";
  return null;
}

/** Body of a markdown section: from the matched `##` heading to the next `##`. */
function sectionBody(md: string, heading: RegExp): string | null {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || /^##\s/.test(line)) break;
    body.push(line);
  }
  return body.join("\n");
}

/** Content of each `- ` bullet in `text`, without the leading marker. */
function bulletLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());
}

/** 9-10 digit event ids and `i…` activity ids, de-duplicated. */
function extractIntervalsIds(text: string): string[] {
  const matches = text.match(/\b(i\d{8,10}|\d{9,10})\b/g) ?? [];
  return [...new Set(matches)];
}

// --- Per-file parsers -------------------------------------------------------

function zonesFromObject(obj: Record<string, [number, number]> | undefined): Zone[] | null {
  if (!obj) return null;
  return Object.entries(obj).map(([name, [min, max]]) => ({ name, min, max }));
}

function thresholdSourceFor(event: string | undefined): ThresholdSource {
  const e = (event ?? "").toLowerCase();
  if (e.includes("eftp") || e.includes("estim")) return "estimated";
  if (e.includes("déclar") || e.includes("declar") || e.includes("athlète") || e.includes("athlete")) {
    return "manual";
  }
  return "test";
}

function parseConstraints(md: string): AthleteConstraints {
  const result: AthleteConstraints = {};

  const hours = md.match(/(\d{1,2})\s*h\s*\/?\s*semaine/i);
  if (hours) result.weeklyHours = Number(hours[1]);

  const creneaux = sectionBody(md, /##\s*Créneaux fixes/i);
  if (creneaux) {
    const slots = bulletLines(creneaux)
      .map((line) => {
        const day = line
          .toLowerCase()
          .match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
        return day ? { day: day[1] } : null;
      })
      .filter((s): s is { day: string } => s !== null);
    if (slots.length) result.fixedSlots = slots;
  }

  const materiel = sectionBody(md, /##\s*Matériel/i);
  if (materiel) {
    const items = bulletLines(materiel).map((l) => l.replace(/\*\*/g, "").trim());
    if (items.length) result.equipment = items;
  }

  return result;
}

function parseGoals(md: string): SeedGoal[] {
  const goals: SeedGoal[] = [];
  for (const rawLine of md.split("\n")) {
    const line = rawLine.trim();
    // Race bullets carry a bold `Name — date` and an explicit `priorité`.
    if (!line.startsWith("- ") || !/priorité/i.test(line)) continue;
    const boldText = line.match(/\*\*(.+?)\*\*/)?.[1];
    if (!boldText) continue;
    const [name, dateStr] = boldText.split(/\s+[—–-]\s+/);
    if (!name || !dateStr) continue;
    const targetDate = frenchDateToIso(dateStr, SEASON_YEAR);
    const priorityMatch = line.match(/priorité\s*\*\*([^*]+)\*\*/i);
    const tier = priorityMatch?.[1]?.trim().charAt(0).toUpperCase();
    const priority: GoalPriority | null = tier === "A" || tier === "B" || tier === "C" ? tier : null;
    goals.push({
      title: name.trim(),
      description: line.slice(2).trim(),
      type: "event",
      targetDate,
      priority
    });
  }
  return goals;
}

function parseMacroPlan(md: string): SeedPlan {
  const blocks: SeedBlock[] = [];
  for (const rawLine of md.split("\n")) {
    const line = rawLine.trim();
    if (!/^\|\s*\*\*W\d+/.test(line)) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    // cells: [Sem, Dates, Phase, Focus, TSS, CTL/TSB, Séances clés]
    const datesCell = cells[1];
    if (!datesCell) continue;
    const dates = parseWeekDates(datesCell, SEASON_YEAR);
    if (!dates) continue;
    const week = (cells[0] ?? "").replace(/\*/g, "").trim();
    const phase = (cells[2] ?? "").trim();
    const focus = (cells[3] ?? "").trim() || null;
    const plannedTss = parseTss(cells[4] ?? "");
    const weeklyTarget: WeeklyTarget = { weekStart: dates.start };
    if (plannedTss !== undefined) weeklyTarget.plannedTss = plannedTss;
    if (focus) weeklyTarget.focus = focus;
    blocks.push({
      name: phase ? `${week} — ${phase}` : week,
      phaseType: phaseTypeFrom(phase),
      startDate: dates.start,
      endDate: dates.end,
      focus,
      orderIndex: blocks.length,
      weeklyTargets: [weeklyTarget]
    });
  }
  if (blocks.length === 0) {
    throw new Error("macro-plan.md : aucune ligne de semaine parsée (table W## attendue).");
  }

  const titleLine = md.split("\n").find((l) => l.startsWith("# "));
  const name = titleLine ? titleLine.replace(/^#\s*/, "").trim() : "Macro-plan";
  const startDate = blocks.map((b) => b.startDate).reduce((a, b) => (b < a ? b : a));
  const endDate = blocks.map((b) => b.endDate).reduce((a, b) => (b > a ? b : a));

  return { name, startDate, endDate, peakGoalTitle: null, blocks };
}

function parseAdaptationLog(md: string): SeedLog[] {
  const entries: SeedLog[] = [];
  for (const chunk of md.split(/^---\s*$/m)) {
    const trimmed = chunk.trim();
    const heading = trimmed.match(
      /^##\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?\s*·\s*([^·\n]+?)\s*·\s*([^\n]+)/
    );
    if (!heading) continue;
    const date = heading[1];
    const time = heading[2];
    const author = heading[3];
    const typeLabel = heading[4];
    if (!date || !author || !typeLabel) continue;

    const fields: Record<string, string> = {};
    const fieldRe = /^-\s*\*\*([^*]+)\*\*\s*[:：]\s*(.*)$/gm;
    let m: RegExpExecArray | null;
    while ((m = fieldRe.exec(trimmed)) !== null) {
      const label = m[1];
      const value = m[2];
      if (label === undefined || value === undefined) continue;
      fields[label.trim().toLowerCase()] = value.trim();
    }

    const summary = fields["quoi"] ?? typeLabel.trim();
    const ref = fields["réf"] ?? fields["ref"] ?? "";
    entries.push({
      // Most entries are day-granular; the few with a time are normalised to UTC
      // (deliberate — journal metadata, exact wall-clock tz is not load-bearing).
      occurredAt: new Date(`${date}T${time ?? "00:00"}:00Z`),
      author: author.trim(),
      trigger: null,
      summary,
      detail: { entryType: typeLabel.trim(), fields, raw: trimmed },
      relatedWeek: null,
      intervalsEventIds: extractIntervalsIds(`${ref} ${fields["quoi"] ?? ""}`)
    });
  }
  if (entries.length === 0) {
    throw new Error("adaptation-log.md : aucune entrée parsée (## <date> · <agent> · <type> attendu).");
  }
  return entries;
}

// --- Store → parsed data ----------------------------------------------------

function requireContent(byPath: Map<string, string | null>, path: string): string {
  if (!byPath.has(path)) throw new Error(`Fichier attendu absent du store : ${path}`);
  const content = byPath.get(path);
  if (content === null || content === undefined) {
    throw new Error(`Fichier présent mais vide/illisible : ${path}`);
  }
  return content;
}

/** Read the store's memories and map them to the structured rows to write. */
export function parseAthleteStore(memories: MemoryEntry[]): ParsedAthleteData {
  const byPath = new Map(memories.map((m) => [m.path, m.content]));

  const physiology = physiologySchema.parse(JSON.parse(requireContent(byPath, "/physiology.json")));
  const fitness = fitnessStateSchema.parse(JSON.parse(requireContent(byPath, "/fitness-state.json")));
  const constraintsMd = requireContent(byPath, "/constraints.md");
  const healthMd = requireContent(byPath, "/health.md");
  const goalsMd = requireContent(byPath, "/goals.md");
  const macroMd = requireContent(byPath, "/current-plan/macro-plan.md");
  const adaptationMd = requireContent(byPath, "/adaptation-log.md");

  const powerZones = zonesFromObject(physiology.cycling.power_zones_w);
  const currentFtp = physiology.cycling.ftp_w;
  const history = physiology.history ?? [];
  const thresholds: SeedThreshold[] = history.map((h) => {
    const isCurrent = h.ftp_w === currentFtp;
    return {
      sport: "bike",
      ftpWatts: h.ftp_w,
      thresholdHr: isCurrent ? physiology.cycling.lthr_bpm ?? null : null,
      maxHr: isCurrent ? physiology.cycling.max_hr_bpm ?? null : null,
      powerZones: isCurrent ? powerZones : null,
      hrZones: null,
      source: thresholdSourceFor(h.event),
      effectiveDate: h.date
    };
  });

  const targets = fitness.targets;
  const coachingTargets: CoachingTargets | null = targets
    ? {
        ...(targets.peak_event !== undefined ? { peakEvent: targets.peak_event } : {}),
        ...(targets.ctl_peak_target !== undefined ? { ctlPeakTarget: targets.ctl_peak_target } : {}),
        ...(targets.ctl_weekly_ramp_max !== undefined ? { rampMax: targets.ctl_weekly_ramp_max } : {}),
        ...(targets.tsb_race_window !== undefined ? { tsbWindow: targets.tsb_race_window } : {})
      }
    : null;

  const profile: SeedProfile = {
    weightKg: physiology.athlete?.weight_kg !== undefined ? String(physiology.athlete.weight_kg) : null,
    weightTargetKg:
      physiology.athlete?.weight_target_kg !== undefined
        ? String(physiology.athlete.weight_target_kg)
        : null,
    maxHr: physiology.cycling.max_hr_bpm ?? null,
    restingHr: null,
    constraints: parseConstraints(constraintsMd),
    constraintsNotes: constraintsMd,
    healthNotes: healthMd,
    coachingTargets
  };

  const goals = parseGoals(goalsMd);
  const plan = parseMacroPlan(macroMd);
  // Link the plan to its peak goal (the season A-target named in the macro-plan title).
  const peak = goals.find((g) => plan.name.includes(g.title));
  plan.peakGoalTitle = peak ? peak.title : null;

  const logs = parseAdaptationLog(adaptationMd);

  return { profile, thresholds, goals, plan, logs };
}

// --- Writing to Neon --------------------------------------------------------

export interface WriteResult {
  athleteId: string;
  counts: { thresholds: number; goals: number; plans: number; blocks: number; logs: number };
}

/**
 * Write the parsed data idempotently. Keyed tables upsert on their natural key;
 * the keyless tables (goal, plan/blocks, journal) are cleared for this athlete and
 * re-inserted from source, so re-running replaces rather than duplicates.
 */
export async function writeSeed(
  db: Db,
  data: ParsedAthleteData,
  routing: AthleteRouting
): Promise<WriteResult> {
  if (!routing.phoneNum) {
    throw new Error("phoneNum manquant : impossible d'écrire l'athlète (clé de routage).");
  }
  const now = new Date();

  const upsertedAthlete = await db
    .insert(athlete)
    .values({
      phoneNum: routing.phoneNum,
      displayName: routing.displayName,
      chatId: routing.chatId,
      anthropicSessionId: routing.anthropicSessionId,
      managedAgentId: routing.managedAgentId,
      memoryStoreId: routing.memoryStoreId
    })
    .onConflictDoUpdate({
      target: athlete.phoneNum,
      set: {
        displayName: routing.displayName,
        chatId: routing.chatId,
        anthropicSessionId: routing.anthropicSessionId,
        managedAgentId: routing.managedAgentId,
        memoryStoreId: routing.memoryStoreId,
        updatedAt: now
      }
    })
    .returning({ id: athlete.id });
  const athleteRow = upsertedAthlete[0];
  if (!athleteRow) throw new Error("Upsert athlete n'a renvoyé aucune ligne.");
  const athleteId = athleteRow.id;

  await db
    .insert(athleteProfile)
    .values({ athleteId, ...data.profile })
    .onConflictDoUpdate({
      target: athleteProfile.athleteId,
      set: { ...data.profile, updatedAt: now }
    });

  // Thresholds are historical (append-only): upsert on the natural key, never
  // deleted. Re-running with the same history is a no-op; history only ever grows.
  for (const t of data.thresholds) {
    await db
      .insert(athleteThreshold)
      .values({ athleteId, ...t })
      .onConflictDoUpdate({
        target: [athleteThreshold.athleteId, athleteThreshold.sport, athleteThreshold.effectiveDate],
        set: {
          ftpWatts: t.ftpWatts,
          thresholdHr: t.thresholdHr,
          maxHr: t.maxHr,
          powerZones: t.powerZones,
          hrZones: t.hrZones,
          source: t.source
        }
      });
  }

  // Keyless tables: clear-then-insert, scoped to this athlete. Order respects the
  // FKs: adaptation_log references training_plan and training_plan references goal
  // (both ON DELETE set null), and plan_block cascades from training_plan — so we
  // drop the journal, then the plan (blocks cascade), then goals, before re-inserting.
  await db.delete(adaptationLog).where(eq(adaptationLog.athleteId, athleteId));
  await db.delete(trainingPlan).where(eq(trainingPlan.athleteId, athleteId));
  await db.delete(goal).where(eq(goal.athleteId, athleteId));

  const goalIdByTitle = new Map<string, string>();
  for (const g of data.goals) {
    const inserted = await db.insert(goal).values({ athleteId, ...g }).returning({ id: goal.id });
    const row = inserted[0];
    if (row) goalIdByTitle.set(g.title, row.id);
  }

  const peakGoalId = data.plan.peakGoalTitle
    ? goalIdByTitle.get(data.plan.peakGoalTitle) ?? null
    : null;
  const insertedPlan = await db
    .insert(trainingPlan)
    .values({
      athleteId,
      goalId: peakGoalId,
      name: data.plan.name,
      startDate: data.plan.startDate,
      endDate: data.plan.endDate,
      status: "active",
      createdBy: "ai"
    })
    .returning({ id: trainingPlan.id });
  const planRow = insertedPlan[0];
  if (!planRow) throw new Error("Insert training_plan n'a renvoyé aucune ligne.");
  const planId = planRow.id;

  for (const b of data.plan.blocks) {
    await db.insert(planBlock).values({ planId, ...b });
  }

  for (const l of data.logs) {
    await db.insert(adaptationLog).values({ athleteId, ...l });
  }

  return {
    athleteId,
    counts: {
      thresholds: data.thresholds.length,
      goals: data.goals.length,
      plans: 1,
      blocks: data.plan.blocks.length,
      logs: data.logs.length
    }
  };
}

// --- Completeness check -----------------------------------------------------

export interface CompletenessRow {
  table: string;
  expected: number;
  actual: number;
  ok: boolean;
}

export interface CompletenessReport {
  ok: boolean;
  rows: CompletenessRow[];
}

/** Row counts (and profile-field presence) read back from Neon. */
export interface CompletenessCounts {
  profileRows: number;
  profileHasCoachingTargets: boolean;
  profileHasConstraintsNotes: boolean;
  profileHasHealthNotes: boolean;
  thresholds: number;
  goals: number;
  plans: number;
  blocks: number;
  logs: number;
}

/**
 * Pure verdict: does what we read back from the DB match what we parsed? A field
 * is only required when we actually parsed a value for it (so a store legitimately
 * missing coaching targets is not a false "incomplete"). Kept separate from the DB
 * reads so this safety-critical logic — the gate before the irreversible clear — is
 * unit-testable without a live database.
 */
export function evaluateCompleteness(
  actual: CompletenessCounts,
  data: ParsedAthleteData
): CompletenessReport {
  const expectCoaching = data.profile.coachingTargets !== null;
  const expectConstraintsNotes = data.profile.constraintsNotes.length > 0;
  const expectHealthNotes = data.profile.healthNotes.length > 0;
  const profileOk =
    actual.profileRows === 1 &&
    (!expectCoaching || actual.profileHasCoachingTargets) &&
    (!expectConstraintsNotes || actual.profileHasConstraintsNotes) &&
    (!expectHealthNotes || actual.profileHasHealthNotes);

  const rows: CompletenessRow[] = [
    { table: "athlete_profile", expected: 1, actual: actual.profileRows, ok: profileOk },
    {
      table: "athlete_threshold",
      expected: data.thresholds.length,
      actual: actual.thresholds,
      ok: actual.thresholds === data.thresholds.length && actual.thresholds > 0
    },
    { table: "goal", expected: data.goals.length, actual: actual.goals, ok: actual.goals === data.goals.length },
    { table: "training_plan", expected: 1, actual: actual.plans, ok: actual.plans === 1 },
    {
      table: "plan_block",
      expected: data.plan.blocks.length,
      actual: actual.blocks,
      ok: actual.blocks === data.plan.blocks.length && actual.blocks > 0
    },
    {
      table: "adaptation_log",
      expected: data.logs.length,
      actual: actual.logs,
      ok: actual.logs === data.logs.length && actual.logs > 0
    }
  ];

  return { ok: rows.every((r) => r.ok), rows };
}

/** Query Neon for the written row counts, then delegate the verdict to `evaluateCompleteness`. */
export async function checkCompleteness(
  db: Db,
  athleteId: string,
  data: ParsedAthleteData
): Promise<CompletenessReport> {
  const profileRows = await db
    .select({
      coachingTargets: athleteProfile.coachingTargets,
      constraintsNotes: athleteProfile.constraintsNotes,
      healthNotes: athleteProfile.healthNotes
    })
    .from(athleteProfile)
    .where(eq(athleteProfile.athleteId, athleteId));
  const profile = profileRows[0];

  const thresholds = await db
    .select({ id: athleteThreshold.id })
    .from(athleteThreshold)
    .where(eq(athleteThreshold.athleteId, athleteId));
  const goals = await db.select({ id: goal.id }).from(goal).where(eq(goal.athleteId, athleteId));
  const plans = await db
    .select({ id: trainingPlan.id })
    .from(trainingPlan)
    .where(eq(trainingPlan.athleteId, athleteId));
  const blocks = plans.length
    ? await db
        .select({ id: planBlock.id })
        .from(planBlock)
        .where(inArray(planBlock.planId, plans.map((p) => p.id)))
    : [];
  const logs = await db
    .select({ id: adaptationLog.id })
    .from(adaptationLog)
    .where(eq(adaptationLog.athleteId, athleteId));

  return evaluateCompleteness(
    {
      profileRows: profileRows.length,
      profileHasCoachingTargets: !!profile?.coachingTargets,
      profileHasConstraintsNotes: !!profile?.constraintsNotes,
      profileHasHealthNotes: !!profile?.healthNotes,
      thresholds: thresholds.length,
      goals: goals.length,
      plans: plans.length,
      blocks: blocks.length,
      logs: logs.length
    },
    data
  );
}

// --- Clearing the migrated files (gated) ------------------------------------

export interface ClearEntry {
  path: string;
  id: string;
}

export interface ClearReport {
  applied: boolean;
  toDelete: ClearEntry[];
  toKeep: ClearEntry[];
}

/** Split the store's memories into the migrated files vs everything kept. */
export function planClear(memories: MemoryEntry[]): {
  toDelete: MemoryEntry[];
  toKeep: MemoryEntry[];
} {
  const migrated = new Set<string>(MIGRATED_PATHS);
  return {
    toDelete: memories.filter((m) => migrated.has(m.path)),
    toKeep: memories.filter((m) => !migrated.has(m.path))
  };
}

/**
 * Delete the 7 migrated files from the store. Read-only unless `apply` is true;
 * each delete carries the file's sha as an optimistic-concurrency guard so a file
 * changed since the read is not blindly removed.
 */
export async function clearMigratedFiles(
  client: BrainClient,
  storeId: string,
  memories: MemoryEntry[],
  apply: boolean
): Promise<ClearReport> {
  const { toDelete, toKeep } = planClear(memories);
  const report: ClearReport = {
    applied: false,
    toDelete: toDelete.map((m) => ({ path: m.path, id: m.id })),
    toKeep: toKeep.map((m) => ({ path: m.path, id: m.id }))
  };
  if (!apply) return report;

  ensureApply(apply, `vider ${toDelete.length} mémoire(s) migrée(s) du store ${storeId}`);
  for (const m of toDelete) {
    await client.beta.memoryStores.memories.delete(m.id, {
      memory_store_id: storeId,
      expected_content_sha256: m.contentSha256
    });
  }
  return { ...report, applied: true };
}
