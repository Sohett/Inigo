import type { BrainClient } from "../client";
import { ensureApply } from "./writeGuard";

export interface AddEnvVarInput {
  vaultId: string;
  /** Environment variable name (immutable after create). */
  secretName: string;
  /** Secret value. Write-only, never logged or returned. */
  secretValue: string;
  /** Bare hostnames the secret is substituted on at egress (max 16). */
  allowedHosts: string[];
  displayName?: string;
}

export interface AddEnvVarPlan {
  vaultId: string;
  secretName: string;
  allowedHosts: string[];
  displayName?: string;
  /** Always masked — the plan is safe to print. */
  secretValue: "***";
}

export interface AddEnvVarResult {
  plan: AddEnvVarPlan;
  applied: boolean;
  credentialId?: string;
}

/**
 * Add an `environment_variable` credential (an env var / secret) to a vault.
 * Read-only unless `apply` is true. The returned plan masks the secret so it is
 * always safe to log; the raw value is only ever sent in the write request.
 */
export async function addEnvVarCredential(
  client: BrainClient,
  input: AddEnvVarInput,
  apply: boolean
): Promise<AddEnvVarResult> {
  if (input.allowedHosts.length === 0) {
    throw new Error("allowedHosts est requis (au moins un hôte) pour un credential env var.");
  }

  const plan: AddEnvVarPlan = {
    vaultId: input.vaultId,
    secretName: input.secretName,
    allowedHosts: input.allowedHosts,
    displayName: input.displayName,
    secretValue: "***"
  };

  if (!apply) {
    return { plan, applied: false };
  }
  ensureApply(apply, `add env var ${input.secretName} to vault ${input.vaultId}`);

  const credential = await client.beta.vaults.credentials.create(input.vaultId, {
    display_name: input.displayName ?? null,
    auth: {
      type: "environment_variable",
      secret_name: input.secretName,
      secret_value: input.secretValue,
      networking: { type: "limited", allowed_hosts: input.allowedHosts }
    }
  });

  return { plan, applied: true, credentialId: credential.id };
}
