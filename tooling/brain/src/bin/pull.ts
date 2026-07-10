import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config";
import { createBrainClient } from "../client";
import { collectSnapshot, writeSnapshot } from "../lib/snapshot";
import { loadLocalEnv } from "../lib/util";

async function main(): Promise<void> {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  loadLocalEnv(packageRoot);

  const config = loadConfig();
  const client = createBrainClient(config.ANTHROPIC_API_KEY);

  const snapshot = await collectSnapshot(client, { agentId: config.BRAIN_AGENT_ID });

  const outDir = path.join(packageRoot, "snapshot");
  await writeSnapshot(snapshot, outDir, new Date().toISOString());

  console.log(`Snapshot écrit dans ${outDir}`);
  console.log(
    `  agents=${snapshot.agentDetails.length} environments=${snapshot.environments.length} ` +
      `vaults=${snapshot.vaults.length} memoryStores=${snapshot.memoryStores.length} ` +
      `skills=${snapshot.skills.length}`
  );
  for (const note of snapshot.notes) console.log(`  note: ${note}`);
  if (snapshot.errors.length > 0) {
    console.error(`  ${snapshot.errors.length} erreur(s) :`);
    for (const e of snapshot.errors) console.error(`    - ${e.resource}: ${e.message}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
