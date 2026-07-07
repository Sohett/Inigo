import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config";
import { createBrainClient } from "../client";
import { deploySkill } from "../lib/deploySkill";
import { getOption, hasFlag, positionals } from "../lib/args";
import { loadLocalEnv } from "../lib/util";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const nameArg = positionals(argv)[0];
  if (!nameArg) {
    console.error(
      "Usage: brain:skill:deploy <skill-name|path> [--apply] [--attach --agent=<agent_id>]"
    );
    process.exit(1);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  loadLocalEnv(path.resolve(here, "../.."));

  const apply = hasFlag(argv, "apply");
  const attach = hasFlag(argv, "attach");
  const config = loadConfig();
  const agentId = getOption(argv, "agent") ?? config.BRAIN_AGENT_ID;
  if (attach && !agentId) {
    console.error("--attach nécessite --agent=<id> ou BRAIN_AGENT_ID.");
    process.exit(1);
  }

  const repoRoot = path.resolve(here, "../../../..");
  const skillDir =
    nameArg.includes("/") || nameArg.startsWith(".")
      ? path.resolve(process.cwd(), nameArg)
      : path.join(repoRoot, "tooling/agent-skills", nameArg);

  const client = createBrainClient(config.ANTHROPIC_API_KEY);
  const result = await deploySkill(client, skillDir, {
    apply,
    attachAgentId: attach ? agentId : undefined
  });

  if (!result.applied) {
    console.log(`[dry-run] deploy « ${result.plan.skillName} » (${result.plan.action})`);
    console.log(`  dossier : ${skillDir}`);
    console.log(`  fichiers : ${result.plan.files.join(", ")}`);
    if (result.plan.existingSkillId) console.log(`  skill existant : ${result.plan.existingSkillId}`);
    if (attach) console.log(`  serait attaché à l'agent : ${agentId}`);
    console.log("  → Relance avec --apply pour exécuter.");
    return;
  }

  console.log(
    `Skill déployé : ${result.plan.skillName} → ${result.skillId} (version ${result.version})`
  );
  if (result.attachedToAgent) console.log(`  attaché à l'agent : ${result.attachedToAgent}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
