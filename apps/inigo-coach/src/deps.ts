import Anthropic from "@anthropic-ai/sdk";
import { loadConfig, type Config } from "./config/config";
import { createManagedAgentBrain, type ManagedAgentBrain } from "./brain/managedAgents";

export interface Deps {
  config: Config;
  brain: ManagedAgentBrain;
}

let cached: Deps | null = null;

/**
 * Lazily build and cache the validated config + brain.
 *
 * Deferred to first request (rather than module load) so the Next.js build does
 * not fail when secrets are absent at build time.
 */
export function getDeps(): Deps {
  if (cached === null) {
    const config = loadConfig();
    const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    cached = { config, brain: createManagedAgentBrain(anthropic) };
  }
  return cached;
}
