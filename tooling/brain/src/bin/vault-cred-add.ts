import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config";
import { createBrainClient } from "../client";
import { addEnvVarCredential } from "../lib/vaultCred";
import { getOption, hasFlag } from "../lib/args";
import { loadLocalEnv } from "../lib/util";

function usage(): never {
  console.error(
    "Usage: brain:vault:cred:add --vault=<vlt_id> --name=<SECRET_NAME> " +
      "(--value-env=<ENV_VAR> | --value=<literal>) --hosts=host1,host2 " +
      "[--display=<label>] [--apply]"
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = hasFlag(argv, "apply");

  loadLocalEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));

  const vaultId = getOption(argv, "vault");
  const secretName = getOption(argv, "name");
  const hostsRaw = getOption(argv, "hosts");
  const displayName = getOption(argv, "display");

  // Prefer reading the secret from an env var so it never lands in shell history.
  const valueEnv = getOption(argv, "value-env");
  const secretValue = valueEnv ? process.env[valueEnv] : getOption(argv, "value");

  if (!vaultId || !secretName || !hostsRaw) usage();
  if (!secretValue) {
    console.error(
      valueEnv
        ? `La variable d'environnement ${valueEnv} est vide ou absente.`
        : "Fournir le secret via --value-env=<ENV_VAR> (recommandé) ou --value=<literal>."
    );
    process.exit(1);
  }

  const allowedHosts = hostsRaw
    .split(",")
    .map((h) => h.trim())
    .filter((h) => h.length > 0);

  const config = loadConfig();
  const client = createBrainClient(config.ANTHROPIC_API_KEY);

  const result = await addEnvVarCredential(
    client,
    { vaultId, secretName, secretValue, allowedHosts, displayName },
    apply
  );

  if (!result.applied) {
    console.log(`[dry-run] add env var « ${result.plan.secretName} » au vault ${result.plan.vaultId}`);
    console.log(`  hôtes autorisés : ${result.plan.allowedHosts.join(", ")}`);
    console.log(`  valeur : ${result.plan.secretValue}`);
    console.log("  → Relance avec --apply pour créer le credential.");
    return;
  }

  console.log(
    `Credential créé : ${result.credentialId} (${result.plan.secretName}) dans ${result.plan.vaultId}`
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
