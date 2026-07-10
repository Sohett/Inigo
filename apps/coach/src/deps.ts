import Anthropic from "@anthropic-ai/sdk";
import { createDb, type Db } from "@inigo/db";
import { loadConfig, type Config } from "./config/config";
import { createManagedAgentBrain, type ManagedAgentBrain } from "./brain/managedAgents";
import {
  createDrizzleAthleteRepository
} from "./repositories/drizzleAthleteRepository";
import type { AthleteRepository } from "./repositories/athleteRepository";
import {
  createAthleteDataRepository,
  type AthleteDataRepository
} from "./mcp/repository/athleteDataRepository";

export interface Deps {
  config: Config;
  brain: ManagedAgentBrain;
  db: Db;
  repo: AthleteRepository;
  athleteData: AthleteDataRepository;
}

let cached: Deps | null = null;

/**
 * Lazily build and cache the validated config + brain + DB client + athlete repo.
 *
 * Deferred to first request (rather than module load) so the Next.js build does
 * not fail when secrets are absent at build time. `createDb` is lazy (Neon opens no
 * connection until a query runs), so this stays cheap and network-free.
 */
export function getDeps(): Deps {
  if (cached === null) {
    const config = loadConfig();
    const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    const db = createDb(config.DATABASE_URL);
    cached = {
      config,
      brain: createManagedAgentBrain(anthropic),
      db,
      repo: createDrizzleAthleteRepository(db),
      athleteData: createAthleteDataRepository(db)
    };
  }
  return cached;
}
