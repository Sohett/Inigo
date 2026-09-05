import { z } from "zod";
import type { BrainSessionTemplate } from "../domain/brain";
import type { BrainConfigRepository } from "../repositories/brainConfigRepository";

/**
 * Shape of an admin edit of the brain template. Prefixes are checked because a typo
 * in one of these ids fails much later and much more confusingly (at session creation,
 * as an opaque Anthropic 404). Blank optional fields arrive as empty strings from the
 * form, and normalise to "no memory store" / "no vaults".
 */
export const brainConfigInputSchema = z.object({
  coordinatorAgentId: z.string().trim().startsWith("agent_", "must start with agent_"),
  environmentId: z.string().trim().startsWith("env_", "must start with env_"),
  vaultIds: z
    .array(z.string().trim().startsWith("vlt_", "must start with vlt_"))
    .default([]),
  memoryStoreId: z
    .string()
    .trim()
    .startsWith("memstore_", "must start with memstore_")
    .nullish()
    .transform((value) => value ?? null),
  memoryStoreAccess: z.enum(["read_only", "read_write"]).default("read_only")
});

export type BrainConfigInput = z.input<typeof brainConfigInputSchema>;

export type UpdateBrainConfigOutcome =
  | { status: "saved"; template: BrainSessionTemplate }
  | { status: "invalid"; issues: string[] };

export interface UpdateBrainConfigDeps {
  brainConfig: BrainConfigRepository;
}

export interface UpdateBrainConfig {
  execute(input: unknown): Promise<UpdateBrainConfigOutcome>;
}

/**
 * Replace the brain session template. Validation failures are returned as an outcome
 * (the route answers 400); only a repository failure throws.
 */
export function createUpdateBrainConfig(deps: UpdateBrainConfigDeps): UpdateBrainConfig {
  return {
    async execute(input: unknown): Promise<UpdateBrainConfigOutcome> {
      const parsed = brainConfigInputSchema.safeParse(input);
      if (!parsed.success) {
        const issues = parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
        );
        return { status: "invalid", issues };
      }
      const template = await deps.brainConfig.save(parsed.data);
      return { status: "saved", template };
    }
  };
}
