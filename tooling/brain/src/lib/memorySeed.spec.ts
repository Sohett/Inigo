import { describe, expect, it, vi } from "vitest";
import type { BrainClient } from "../client";
import type { MemoryEntry } from "./memoryAudit";
import {
  MIGRATED_PATHS,
  clearMigratedFiles,
  evaluateCompleteness,
  parseAthleteStore,
  planClear,
  type CompletenessCounts
} from "./memorySeed";

/**
 * Fixtures are sanitized miniatures of the real store files (same shapes, no PII),
 * enough to exercise every branch of the mapping. The parsers are content-shaped,
 * so these lock the mapping behaviour in place.
 */

let counter = 0;
function entry(path: string, content: string): MemoryEntry {
  counter += 1;
  return { id: `mem_${counter}`, path, content, contentSha256: `sha-${counter}`, bytes: content.length };
}

const PHYSIOLOGY = JSON.stringify({
  athlete: { weight_kg: 83, weight_target_kg: 78 },
  cycling: {
    ftp_w: 282,
    ftp_confidence: "athlete_reported",
    lthr_bpm: null,
    max_hr_bpm: null,
    power_zones_w: { z1: [0, 155], z2: [156, 211], z4: [255, 296] }
  },
  history: [
    { date: "2026-06-21", ftp_w: 305, event: "eFTP Intervals.icu", ctl: 45 },
    { date: "2026-07-03", ftp_w: 282, event: "Déclaré athlète", ctl: 47.6 }
  ]
});

const FITNESS_STATE = JSON.stringify({
  current: { date: "2026-07-06", ctl: 48.3, atl: 55.1, tsb: -6.8 },
  targets: {
    peak_event: "Le Tour BCF",
    ctl_peak_target: 58,
    ctl_weekly_ramp_max: 5,
    tsb_race_window: [5, 20]
  }
});

const GOALS = `# Objectifs

## Objectif de saison (A+)
- **Le Tour BCF — 16-20 septembre 2026** · course à étapes · priorité **A+**.

## Objectifs A
- **La Doyenne — 5 septembre 2026** · route vallonné · priorité **A**.
- **8h de Spa — 25 juillet 2026** · relais équipe · priorité **A-**.

## Blocs montagne (pas des objectifs)
- **Alpes — 13-19 juillet** : gros volume montagne.
`;

const CONSTRAINTS = `# Contraintes & disponibilités

## Créneaux fixes
- **Mardi matin** : renfo avec coach.
- Boulot : à préciser.

## Volume
- ~12 h/semaine disponibles.

## Matériel
- Home trainer : modèle à confirmer.
- Outdoor : Garmin Edge 540.
`;

const HEALTH = `# Santé & limitations

## Limitations actives
- Pied blessé : course à pied en pause.
`;

const MACRO_PLAN = `# Macro-plan — Thomas · W28 → W38 (route vers Le Tour BCF)

## 2. Plan semaine par semaine
| Sem | Dates | Phase | Focus | TSS cible | CTL | Séances |
|---|---|---|---|---|---|---|
| **W28** | 7-13 juil | Build 1 — reprise / pré-camp | Relancer la structure | **440-500** | ~50 | VO2 |
| **W29** | 13-19 juil | Camp Alpes | Gros volume | **560-680** | ~57 | cols |
| **W30** | 27 juil-2 août | Absorption | Décharge | **360-440** | ~57 | spins |
`;

const ADAPTATION_LOG = `# Journal d'adaptation (append-only)

Format d'une entrée (exemple, non compté) :
## YYYY-MM-DD HH:MM · <agent> · <type>

---

## 2026-06-30 12:00 · système · init
- **Quoi** : Initialisation du modèle athlète.
- **Pourquoi** : Socle v0.1.
- **Réf** : athlete-model/*.

---

## 2026-07-03 · re-adaptateur · réadaptation
- **Quoi** : Correction FTP 305 → 282 W.
- **Pourquoi** : Donnée athlète prime sur l'eFTP.
- **Réf** : event 118215221 ; activity i161898923.
`;

function fullStore(): MemoryEntry[] {
  counter = 0;
  return [
    entry("/physiology.json", PHYSIOLOGY),
    entry("/fitness-state.json", FITNESS_STATE),
    entry("/goals.md", GOALS),
    entry("/constraints.md", CONSTRAINTS),
    entry("/health.md", HEALTH),
    entry("/current-plan/macro-plan.md", MACRO_PLAN),
    entry("/adaptation-log.md", ADAPTATION_LOG),
    // Kept (not migrated):
    entry("/physiology.schema.json", "{}"),
    entry("/ops-intervals-mcp.md", "# ops"),
    entry("/current-plan/week-2026-28.md", "# week"),
    entry("/runtime/proposed-week.json", "{}")
  ];
}

describe("parseAthleteStore", () => {
  const data = parseAthleteStore(fullStore());

  it("maps physiology.json into the profile (weight, HR)", () => {
    expect(data.profile.weightKg).toBe("83");
    expect(data.profile.weightTargetKg).toBe("78");
    expect(data.profile.maxHr).toBeNull();
    expect(data.profile.restingHr).toBeNull();
  });

  it("historises FTP as one threshold per history point, zones on the current one", () => {
    expect(data.thresholds).toHaveLength(2);
    const old = data.thresholds.find((t) => t.ftpWatts === 305);
    const current = data.thresholds.find((t) => t.ftpWatts === 282);
    expect(old?.source).toBe("estimated");
    expect(old?.powerZones).toBeNull();
    expect(current?.source).toBe("manual");
    expect(current?.effectiveDate).toBe("2026-07-03");
    expect(current?.powerZones).toEqual([
      { name: "z1", min: 0, max: 155 },
      { name: "z2", min: 156, max: 211 },
      { name: "z4", min: 255, max: 296 }
    ]);
  });

  it("maps fitness-state targets into coaching_targets (not the live PMC)", () => {
    expect(data.profile.coachingTargets).toEqual({
      peakEvent: "Le Tour BCF",
      ctlPeakTarget: 58,
      rampMax: 5,
      tsbWindow: [5, 20]
    });
  });

  it("extracts light structured constraints and keeps the full narrative", () => {
    expect(data.profile.constraints?.weeklyHours).toBe(12);
    expect(data.profile.constraints?.fixedSlots).toEqual([{ day: "mardi" }]);
    expect(data.profile.constraints?.equipment).toHaveLength(2);
    expect(data.profile.constraintsNotes).toBe(CONSTRAINTS);
    expect(data.profile.healthNotes).toBe(HEALTH);
  });

  it("parses only the priced race bullets into goals (dates + priority)", () => {
    expect(data.goals.map((g) => g.title)).toEqual(["Le Tour BCF", "La Doyenne", "8h de Spa"]);
    const tour = data.goals.find((g) => g.title === "Le Tour BCF");
    expect(tour?.targetDate).toBe("2026-09-16");
    expect(tour?.priority).toBe("A");
    expect(tour?.type).toBe("event");
    expect(data.goals.find((g) => g.title === "8h de Spa")?.targetDate).toBe("2026-07-25");
  });

  it("parses the macro-plan into a plan + one block per week (French date ranges)", () => {
    expect(data.plan.name).toContain("Le Tour BCF");
    expect(data.plan.peakGoalTitle).toBe("Le Tour BCF");
    expect(data.plan.startDate).toBe("2026-07-07");
    expect(data.plan.endDate).toBe("2026-08-02"); // W30 crosses juil→août
    expect(data.plan.blocks).toHaveLength(3);
    expect(data.plan.blocks.map((b) => b.phaseType)).toEqual(["build", "base", "transition"]);
    expect(data.plan.blocks[0]!.weeklyTargets[0]).toEqual({
      weekStart: "2026-07-07",
      plannedTss: 470,
      focus: "Relancer la structure"
    });
  });

  it("parses adaptation-log entries (skipping the format example) with event ids", () => {
    expect(data.logs).toHaveLength(2);
    expect(data.logs[0]!.author).toBe("système");
    expect(data.logs[0]!.summary).toContain("Initialisation");
    expect(data.logs[1]!.intervalsEventIds).toEqual(expect.arrayContaining(["118215221", "i161898923"]));
    expect(data.logs[1]!.trigger).toBeNull();
  });

  it("throws when a required file is missing", () => {
    const partial = fullStore().filter((m) => m.path !== "/physiology.json");
    expect(() => parseAthleteStore(partial)).toThrow(/physiology\.json/);
  });
});

describe("planClear", () => {
  it("targets exactly the 7 migrated files and keeps the rest", () => {
    const { toDelete, toKeep } = planClear(fullStore());
    expect(toDelete.map((m) => m.path).sort()).toEqual([...MIGRATED_PATHS].sort());
    expect(toKeep.map((m) => m.path)).toEqual([
      "/physiology.schema.json",
      "/ops-intervals-mcp.md",
      "/current-plan/week-2026-28.md",
      "/runtime/proposed-week.json"
    ]);
  });
});

describe("evaluateCompleteness (the gate before the clear)", () => {
  const data = parseAthleteStore(fullStore());
  const fullCounts = (): CompletenessCounts => ({
    profileRows: 1,
    profileHasCoachingTargets: true,
    profileHasConstraintsNotes: true,
    profileHasHealthNotes: true,
    thresholds: data.thresholds.length,
    goals: data.goals.length,
    plans: 1,
    blocks: data.plan.blocks.length,
    logs: data.logs.length
  });

  it("passes only when every count matches what was parsed", () => {
    expect(evaluateCompleteness(fullCounts(), data).ok).toBe(true);
  });

  it("fails and flags the offending table when a count is short", () => {
    const report = evaluateCompleteness({ ...fullCounts(), logs: data.logs.length - 1 }, data);
    expect(report.ok).toBe(false);
    expect(report.rows.find((r) => r.table === "adaptation_log")?.ok).toBe(false);
  });

  it("fails when the profile row is missing", () => {
    expect(evaluateCompleteness({ ...fullCounts(), profileRows: 0 }, data).ok).toBe(false);
  });

  it("does not require coaching_targets when the source had none", () => {
    const store = fullStore().map((m) =>
      m.path === "/fitness-state.json" ? { ...m, content: "{}" } : m
    );
    const noTargets = parseAthleteStore(store);
    expect(noTargets.profile.coachingTargets).toBeNull();
    const report = evaluateCompleteness(
      { ...fullCounts(), profileHasCoachingTargets: false },
      noTargets
    );
    expect(report.ok).toBe(true);
  });
});

describe("clearMigratedFiles", () => {
  function stubClient() {
    const del = vi.fn().mockResolvedValue({ id: "x", type: "memory_deleted" });
    const client = { beta: { memoryStores: { memories: { delete: del } } } } as unknown as BrainClient;
    return { client, del };
  }

  it("deletes nothing in dry-run but reports the plan", async () => {
    const { client, del } = stubClient();
    const report = await clearMigratedFiles(client, "memstore_x", fullStore(), false);
    expect(del).not.toHaveBeenCalled();
    expect(report.applied).toBe(false);
    expect(report.toDelete).toHaveLength(7);
    expect(report.toKeep).toHaveLength(4);
  });

  it("deletes exactly the migrated files with the store id + sha guard when applied", async () => {
    const { client, del } = stubClient();
    const store = fullStore();
    const report = await clearMigratedFiles(client, "memstore_x", store, true);
    expect(del).toHaveBeenCalledTimes(7);
    const physiology = store.find((m) => m.path === "/physiology.json");
    expect(del).toHaveBeenCalledWith(physiology?.id, {
      memory_store_id: "memstore_x",
      expected_content_sha256: physiology?.contentSha256
    });
    expect(report.applied).toBe(true);
  });
});
