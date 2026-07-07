import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@inigo/db";
import { loadConfig } from "../config";
import { createBrainClient } from "../client";
import { collectMemory } from "../lib/memoryAudit";
import {
  DEFAULT_ATHLETE_STORE_ID,
  checkCompleteness,
  clearMigratedFiles,
  parseAthleteStore,
  planClear,
  writeSeed,
  type AthleteRouting,
  type ParsedAthleteData
} from "../lib/memorySeed";
import { hasFlag, getOption } from "../lib/args";
import { loadLocalEnv } from "../lib/util";

/**
 * One-off seed of the athlete memory store into Neon (INI-18).
 *
 *   brain:memory:seed [--store=memstore_…]              # dry-run: read + map + plan
 *   brain:memory:seed --apply --phone=+32…              # write to dev Neon + verify
 *   brain:memory:seed --apply --prod --phone=+32…       # target packages/db/.env.prod
 *   brain:memory:seed --apply --phone=+32… --clear-store   # + delete the 7 migrated files
 *
 * Identity/routing for the athlete row (not secrets) via CLI flags, falling back to
 * the matching ATHLETE_* env var:
 *   --phone=       (required to --apply)   / ATHLETE_PHONE_NUM
 *   --agent-id=    (coordinator)           / ATHLETE_MANAGED_AGENT_ID
 *   --session-id=                          / ATHLETE_SESSION_ID
 *   --chat-id=                             / ATHLETE_CHAT_ID
 *   --display-name= (default "Thomas Sohet") / ATHLETE_DISPLAY_NAME
 * DATABASE_URL (Neon, embeds a password → env only) is required to --apply.
 *
 * Recovery: the DB write is idempotent, so re-running --apply is always safe. If a
 * --clear-store is interrupted mid-way (e.g. a sha guard trips on a concurrent
 * edit), the data is already in Neon; delete any remaining migrated files by hand —
 * a re-run would fail at parse time on the files already removed.
 */

function maskPhone(phone: string | null): string {
  if (!phone) return "(absent)";
  return phone.length <= 5 ? "***" : `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}

function loadRouting(argv: readonly string[], storeId: string): AthleteRouting {
  // CLI flags win over env; these are routing values, not secrets.
  return {
    displayName: getOption(argv, "display-name") ?? process.env.ATHLETE_DISPLAY_NAME ?? "Thomas Sohet",
    phoneNum: getOption(argv, "phone") ?? process.env.ATHLETE_PHONE_NUM ?? null,
    chatId: getOption(argv, "chat-id") ?? process.env.ATHLETE_CHAT_ID ?? null,
    anthropicSessionId: getOption(argv, "session-id") ?? process.env.ATHLETE_SESSION_ID ?? null,
    managedAgentId: getOption(argv, "agent-id") ?? process.env.ATHLETE_MANAGED_AGENT_ID ?? null,
    memoryStoreId: storeId
  };
}

function printPlan(data: ParsedAthleteData, routing: AthleteRouting): void {
  console.log("Mapping athlète → Neon :");
  console.log(
    `  athlete        : ${routing.displayName} · phone ${maskPhone(routing.phoneNum)} · store ${routing.memoryStoreId}`
  );
  console.log(`  athlete_profile: 1 (poids, HR, contraintes, santé, cibles de coaching)`);
  console.log(`  athlete_threshold: ${data.thresholds.length} (historique FTP)`);
  console.log(`  goal           : ${data.goals.length}`);
  console.log(`  training_plan  : 1 (« ${data.plan.name} », ${data.plan.startDate} → ${data.plan.endDate})`);
  console.log(`  plan_block     : ${data.plan.blocks.length}`);
  console.log(`  adaptation_log : ${data.logs.length}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = hasFlag(argv, "apply");
  const clearStore = hasFlag(argv, "clear-store");
  const storeId = getOption(argv, "store") ?? DEFAULT_ATHLETE_STORE_ID;

  if (clearStore && !apply) {
    console.error("--clear-store nécessite --apply (on ne vide qu'après une écriture vérifiée).");
    process.exit(1);
  }

  const useProd = hasFlag(argv, "prod");
  const brainRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  loadLocalEnv(brainRoot);
  // DATABASE_URL is owned by @inigo/db (single source for the connection string);
  // read it from packages/db/.env (or .env.prod with --prod) when brain's env doesn't set it.
  if (!process.env.DATABASE_URL) {
    const dbEnv = path.resolve(brainRoot, "../../packages/db", useProd ? ".env.prod" : ".env");
    if (existsSync(dbEnv)) process.loadEnvFile(dbEnv);
  }
  const config = loadConfig();
  const client = createBrainClient(config.ANTHROPIC_API_KEY);
  const routing = loadRouting(argv, storeId);

  // Read (always, read-only) and map.
  const audit = await collectMemory(client, { storeId });
  const store = audit.stores[0];
  if (!store) {
    console.error(`Store introuvable : ${storeId}`);
    if (audit.errors.length) console.error(audit.errors.map((e) => `  - ${e.message}`).join("\n"));
    process.exit(1);
  }
  const memories = store.memories;
  const data = parseAthleteStore(memories);

  printPlan(data, routing);

  const { toDelete, toKeep } = planClear(memories);
  console.log(
    `Vidage prévu : ${toDelete.length} fichier(s) migré(s) supprimé(s), ${toKeep.length} conservé(s).`
  );

  if (!apply) {
    console.log("\n[dry-run] aucune écriture. Relance avec --apply pour écrire dans Neon.");
    return;
  }

  if (!config.DATABASE_URL) {
    console.error("DATABASE_URL requis pour --apply (connexion Neon).");
    process.exit(1);
  }
  if (!routing.phoneNum) {
    console.error("ATHLETE_PHONE_NUM requis pour --apply (clé de routage de l'athlète).");
    process.exit(1);
  }

  console.log(`\nCible Neon : ${new URL(config.DATABASE_URL).host} (${useProd ? "PROD" : "dev"}).`);
  const db = createDb(config.DATABASE_URL);
  const write = await writeSeed(db, data, routing);
  console.log(`Écrit dans Neon (athlete ${write.athleteId}).`);

  const completeness = await checkCompleteness(db, write.athleteId, data);
  console.log("Complétude (attendu vs DB) :");
  for (const r of completeness.rows) {
    console.log(`  ${r.ok ? "OK " : "KO "} ${r.table} : ${r.actual}/${r.expected}`);
  }

  if (!completeness.ok) {
    console.error("\nComplétude KO → store NON vidé. Corrige puis relance.");
    process.exit(1);
  }

  if (!clearStore) {
    console.log("\nStore intact. Ajoute --clear-store pour supprimer les 7 fichiers migrés.");
    return;
  }

  const report = await clearMigratedFiles(client, storeId, memories, true);
  console.log(`\nStore vidé : ${report.toDelete.length} supprimé(s), ${report.toKeep.length} conservé(s).`);
  for (const e of report.toDelete) console.log(`  supprimé : ${e.path}`);
  for (const e of report.toKeep) console.log(`  conservé : ${e.path}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
