import Anthropic from "@anthropic-ai/sdk";
import { createDb, type Db } from "@inigo/db";
import { loadConfig, type Config } from "./config/config";
import { createManagedAgentBrain, type ManagedAgentBrain } from "./brain/managedAgents";

export interface Deps {
  config: Config;
  brain: ManagedAgentBrain;
  db: Db;
}

let cached: Deps | null = null;

/**
 * Lazily build and cache the validated config + brain + DB client.
 *
 * Deferred to first request (rather than module load) so the Next.js build does
 * not fail when secrets are absent at build time. `createDb` is lazy (Neon opens no
 * connection until a query runs), so this stays cheap and network-free.
 */
export function getDeps(): Deps {
  if (cached === null) {
    const config = loadConfig();
    const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    cached = {
      config,
      brain: createManagedAgentBrain(anthropic),
      db: createDb(config.DATABASE_URL)
    };
  }
  return cached;
}
