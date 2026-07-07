import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config";
import { createBrainClient } from "../client";
import { collectMemory, writeMemoryAudit } from "../lib/memoryAudit";
import { getOption } from "../lib/args";
import { loadLocalEnv } from "../lib/util";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const storeId = getOption(argv, "store");

  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  loadLocalEnv(packageRoot);

  const config = loadConfig();
  const client = createBrainClient(config.ANTHROPIC_API_KEY);

  const audit = await collectMemory(client, { storeId });

  const outDir = path.join(packageRoot, "memory");
  await writeMemoryAudit(audit, outDir, new Date().toISOString());

  if (audit.stores.length === 0) {
    console.log("Aucun memory store trouvé dans le workspace.");
    console.log("→ La mémoire du brain n'est aujourd'hui que le transcript de la/les session(s).");
  } else {
    console.log(`Dump mémoire écrit dans ${outDir}`);
    for (const { store, memories } of audit.stores) {
      const bytes = memories.reduce((sum, m) => sum + m.bytes, 0);
      console.log(`  ${store.id} — ${memories.length} mémoire(s), ${bytes} octets`);
    }
  }
  if (audit.errors.length > 0) {
    console.error(`  ${audit.errors.length} erreur(s) :`);
    for (const e of audit.errors) console.error(`    - ${e.resource}: ${e.message}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
