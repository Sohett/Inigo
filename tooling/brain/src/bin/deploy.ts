import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config";
import { createBrainClient } from "../client";
import { getOption, hasFlag } from "../lib/args";
import { loadLocalEnv } from "../lib/util";
import { deployBrain, deployManifestSchema, type DeployReport } from "../lib/deploy";

function printReport(report: DeployReport, apply: boolean): void {
  const tag = apply ? "" : "[dry-run] ";
  const arrow = (r: { fromVersion: number; toVersion: number; changed: string[] }): string =>
    r.changed.length === 0
      ? `v${r.fromVersion} (inchangé)`
      : `v${r.fromVersion} → v${r.toVersion} (${r.changed.join(", ")})`;

  console.log(`${tag}Deploy du brain`);
  console.log("  Sous-agents :");
  for (const sub of report.subAgents) {
    console.log(`    - ${sub.id} : ${arrow(sub)}`);
  }
  const coord = report.coordinator;
  console.log(`  Coordinateur ${coord.id} : ${arrow(coord)}`);
  if (coord.repinned.length > 0) {
    console.log(`    re-pin : ${coord.repinned.map((r) => `${r.id}=v${r.version}`).join(", ")}`);
  }
  if (coord.unpinnedSubAgents.length > 0) {
    // No-silent-failure: a bumped sub-agent the coordinator won't pick up defeats the deploy.
    console.warn(
      `  ⚠️  Sous-agent(s) appliqué(s) mais ABSENT(S) du roster du coordinateur (non re-pinné, ` +
        `sans effet runtime) : ${coord.unpinnedSubAgents.join(", ")}. Vérifie multiagent.agents.`
    );
  }
  if (report.session.created) {
    console.log(`  Session créée : ${report.session.sessionId} (coordinateur v${report.session.agentVersion})`);
  } else {
    console.log("  Session : non créée (dry-run).");
  }
  if (!apply) {
    console.log("  → Versions estimées (l'--apply utilise les versions réelles renvoyées par l'API).");
    console.log("  → Relance avec --apply pour exécuter le deploy.");
  } else {
    console.log("  → Pense à re-lancer brain:pull pour resynchroniser le snapshot.");
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = hasFlag(argv, "apply");

  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  loadLocalEnv(packageRoot);
  const config = loadConfig();

  const manifestOpt = getOption(argv, "manifest");
  const manifestPath = manifestOpt
    ? path.resolve(process.cwd(), manifestOpt)
    : path.join(packageRoot, "deploy.manifest.json");
  const manifest = deployManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")));

  // The deploy pushes the snapshot state as the desired state — read the config for the
  // coordinator and every sub-agent. Run brain:pull first so it reflects PROD + intended edits.
  const agentConfigs: Record<string, Record<string, unknown>> = {};
  for (const id of [manifest.coordinator, ...manifest.subAgents]) {
    const configPath = path.join(packageRoot, "snapshot", "agents", `${id}.json`);
    agentConfigs[id] = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
  }

  const client = createBrainClient(config.ANTHROPIC_API_KEY);
  const report = await deployBrain(client, { manifest, agentConfigs }, apply);
  printReport(report, apply);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
