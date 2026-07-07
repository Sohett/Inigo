import { customType, timestamp } from "drizzle-orm/pg-core";

/**
 * Raw binary column (Postgres `bytea`). Used for encrypted secret material, which
 * is stored as AES-256-GCM ciphertext / IV / auth tag — never as plaintext.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  }
});

/**
 * `created_at` / `updated_at` as a fresh pair of `timestamptz` columns.
 *
 * A factory (not a shared object) so each table gets its own column builders.
 * `updated_at` is set by the application on write, not by a DB trigger (the DB
 * stores results and decisions; it does not compute them).
 */
export function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  };
}
