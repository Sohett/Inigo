import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { athlete } from "./athlete";
import { bytea } from "./columns";
import type { CredentialProvider } from "./types";

/**
 * Per-athlete third-party secret (today: the Intervals.icu API key), encrypted at
 * rest with AES-256-GCM (see `crypto.ts`). Kept in its own table so a `SELECT *`
 * on `athlete` can never leak it, and reads go through a dedicated accessor.
 * The plaintext key is never stored, logged, or returned by list queries.
 */
export const athleteCredential = pgTable(
  "athlete_credential",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athlete.id, { onDelete: "cascade" }),
    provider: text("provider").$type<CredentialProvider>().notNull().default("intervals_icu"),
    /** Intervals.icu athlete id (e.g. "i123456") needed to call their API. Not secret. */
    externalAthleteId: text("external_athlete_id"),
    secretCiphertext: bytea("secret_ciphertext").notNull(),
    secretIv: bytea("secret_iv").notNull(),
    secretAuthTag: bytea("secret_auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true })
  },
  (t) => [
    unique("athlete_credential_provider_unique").on(t.athleteId, t.provider),
    index("athlete_credential_athlete_idx").on(t.athleteId),
    check("athlete_credential_provider_check", sql`${t.provider} in ('intervals_icu')`)
  ]
);
