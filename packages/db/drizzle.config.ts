import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for @inigo/db.
 *
 * `generate` reads the schema and emits versioned SQL into ./drizzle (no DB needed).
 * `migrate` applies those files and requires DATABASE_URL (a Neon connection string).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ""
  }
});
