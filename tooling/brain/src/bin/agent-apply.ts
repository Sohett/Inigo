import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config";
import { createBrainClient } from "../client";
import { applyAgent } from "../lib/applyAgent";
import { getOption, hasFlag, positionals } from "../lib/args";
import { loadLocalEnv } from "../lib/util";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = hasFlag(argv, "apply");

  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  loadLocalEnv(packageRoot);

  const config = loadConfig();
  const agentId = getOption(argv, "agent") ?? positionals(argv)[0] ?? config.BRAIN_AGENT_ID;
  if (!agentId) {
    console.error("Usage: brain:agent:apply <agent_id> [--file=<path>] [--apply]");
    process.exit(1);
  }

  const fileOpt = getOption(argv, "file");
  const configPath = fileOpt
    ? path.resolve(process.cwd(), fileOpt)
    : path.join(packageRoot, "snapshot", "agents", `${agentId}.json`);

  const raw = await fs.readFile(configPath, "utf8");
  const agentConfig = JSON.parse(raw) as Record<string, unknown>;

  const client = createBrainClient(config.ANTHROPIC_API_KEY);
  const result = await applyAgent(client, { agentId, config: agentConfig }, apply);

  if (result.plan.changedFields.length === 0) {
    console.log(`Aucun changement détecté pour l'agent ${agentId} (version ${result.plan.currentVersion}).`);
    return;
  }

  if (!result.applied) {
    console.log(`[dry-run] agent ${agentId} (version courante ${result.plan.currentVersion})`);
    console.log(`  champs modifiés : ${result.plan.changedFields.join(", ")}`);
    console.log(`  source : ${configPath}`);
    console.log("  → Relance avec --apply pour créer une nouvelle version.");
    return;
  }

  console.log(
    `Agent ${agentId} mis à jour : version ${result.plan.currentVersion} → ${result.newVersion} ` +
      `(champs : ${result.plan.changedFields.join(", ")})`
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
