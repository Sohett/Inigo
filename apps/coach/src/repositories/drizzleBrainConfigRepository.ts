import { brainConfig, type Db } from "@inigo/db";
import type { BrainSessionTemplate } from "../domain/brain";
import type {
  BrainConfigRepository,
  BrainSessionTemplateInput
} from "./brainConfigRepository";

type BrainConfigRow = typeof brainConfig.$inferSelect;

/** The single row's primary key — the table is a singleton (enforced by a DB CHECK). */
const SINGLETON_ID = "default";

/**
 * Map a DB row onto the domain template. The single seam where DB types become
 * business types. Exported so it can be unit-tested without a database.
 */
export function toBrainSessionTemplate(row: BrainConfigRow): BrainSessionTemplate {
  return {
    coordinatorAgentId: row.coordinatorAgentId,
    environmentId: row.environmentId,
    vaultIds: row.vaultIds,
    memoryStoreId: row.memoryStoreId,
    memoryStoreAccess: row.memoryStoreAccess,
    updatedAt: row.updatedAt
  };
}

/**
 * Drizzle-backed `BrainConfigRepository`. Reads and upserts the singleton row, so a
 * save never has to ask which row is live.
 */
export function createDrizzleBrainConfigRepository(db: Db): BrainConfigRepository {
  return {
    async get(): Promise<BrainSessionTemplate | null> {
      const rows = await db.select().from(brainConfig).limit(1);
      const row = rows[0];
      return row ? toBrainSessionTemplate(row) : null;
    },

    async save(template: BrainSessionTemplateInput): Promise<BrainSessionTemplate> {
      const values = {
        coordinatorAgentId: template.coordinatorAgentId,
        environmentId: template.environmentId,
        vaultIds: template.vaultIds,
        memoryStoreId: template.memoryStoreId,
        memoryStoreAccess: template.memoryStoreAccess
      };
      // `updated_at` auto-bumps via the column's `$onUpdate` on the conflict branch;
      // on insert it defaults to now().
      const rows = await db
        .insert(brainConfig)
        .values({ id: SINGLETON_ID, ...values })
        .onConflictDoUpdate({ target: brainConfig.id, set: values })
        .returning();
      const row = rows[0];
      if (!row) throw new Error("brain_config upsert returned no row");
      return toBrainSessionTemplate(row);
    }
  };
}
