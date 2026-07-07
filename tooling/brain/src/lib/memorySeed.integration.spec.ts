import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { athlete, createDb, type Db } from "@inigo/db";
import type { MemoryEntry } from "./memoryAudit";
import {
  checkCompleteness,
  parseAthleteStore,
  writeSeed,
  type AthleteRouting,
  type ParsedAthleteData
} from "./memorySeed";

/**
 * Live round-trip against a real Neon branch. Skipped unless DATABASE_URL is set,
 * so `pnpm verify` stays offline and green. Provisions and tears down its own
 * athlete row (reserved test phone), so it is idempotent and never touches real data.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @inigo/brain test
 */
const databaseUrl = process.env.DATABASE_URL;
const TEST_PHONE = "+320000000001"; // reserved test number, distinct from @inigo/db's

function e(path: string, content: string): MemoryEntry {
  return { id: `mem-${path}`, path, content, contentSha256: `sha-${path}`, bytes: content.length };
}

const STORE: MemoryEntry[] = [
  e(
    "/physiology.json",
    JSON.stringify({
      athlete: { weight_kg: 83, weight_target_kg: 78 },
      cycling: { ftp_w: 282, power_zones_w: { z2: [156, 211] } },
      history: [{ date: "2026-07-03", ftp_w: 282, event: "Déclaré athlète" }]
    })
  ),
  e("/fitness-state.json", JSON.stringify({ targets: { peak_event: "Le Tour BCF", ctl_peak_target: 58 } })),
  e("/goals.md", "# Objectifs\n- **Le Tour BCF — 16-20 septembre 2026** · priorité **A+**.\n"),
  e("/constraints.md", "# Contraintes\n## Volume\n- ~12 h/semaine.\n"),
  e("/health.md", "# Santé\n- Pied en pause.\n"),
  e(
    "/current-plan/macro-plan.md",
    "# Macro-plan (route vers Le Tour BCF)\n| Sem | Dates | Phase | Focus | TSS | CTL | S |\n|---|---|---|---|---|---|---|\n| **W28** | 7-13 juil | Build 1 | Reprise | **440-500** | ~50 | VO2 |\n"
  ),
  e("/adaptation-log.md", "# Journal\n\n---\n\n## 2026-06-30 · système · init\n- **Quoi** : Init.\n")
];

const routing: AthleteRouting = {
  displayName: "Seed Integration Test",
  phoneNum: TEST_PHONE,
  chatId: null,
  anthropicSessionId: null,
  managedAgentId: null,
  memoryStoreId: "memstore_test"
};

describe.skipIf(!databaseUrl)("memory seed <-> Neon (integration)", () => {
  let db: Db;
  let data: ParsedAthleteData;
  let athleteId: string;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    data = parseAthleteStore(STORE);
    await db.delete(athlete).where(eq(athlete.phoneNum, TEST_PHONE));
  });

  afterAll(async () => {
    if (db && athleteId) await db.delete(athlete).where(eq(athlete.id, athleteId));
  });

  it("writes every parsed row and reports complete", async () => {
    const result = await writeSeed(db, data, routing);
    athleteId = result.athleteId;
    const completeness = await checkCompleteness(db, athleteId, data);
    expect(completeness.ok).toBe(true);
    expect(completeness.rows.every((r) => r.ok)).toBe(true);
  });

  it("is idempotent: re-running does not duplicate rows", async () => {
    const again = await writeSeed(db, data, routing);
    expect(again.athleteId).toBe(athleteId);
    const completeness = await checkCompleteness(db, athleteId, data);
    expect(completeness.ok).toBe(true);
  });
});
