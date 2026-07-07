import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Build a Drizzle client over Neon's HTTP driver (serverless-friendly, works from
 * Next.js route handlers). `neon()` is lazy — no connection is opened until a query
 * runs — so calling this at startup is cheap and does not require the network.
 */
export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle({ client: sql, schema });
}

export type Db = ReturnType<typeof createDb>;
