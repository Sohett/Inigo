import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";

/**
 * The WhatsApp gateway the coach sends through. Exactly one row.
 *
 * Only the session identifier lives here, and it lives in the database rather than in the
 * environment because it is the one piece of this configuration that changes on its own: every
 * time the WhatsApp session drops or the QR has to be rescanned, it changes. An env var would
 * mean a redeploy to restore the coach's voice; a row means a form in the admin.
 *
 * Not a secret (the API key is, and stays in the server environment), so it is stored in clear.
 */
export const whatsappGateway = pgTable(
  "whatsapp_gateway",
  {
    /** Singleton key: `true` is the only accepted value, so the table cannot grow a second row. */
    id: boolean("id").primaryKey().default(true),
    /**
     * The gateway session to send from. The REST API accepts either the session name
     * (e.g. `default`) or its id, so this is free-form text rather than a UUID.
     */
    sessionId: text("session_id").notNull(),
    ...timestamps()
  },
  (t) => [check("whatsapp_gateway_singleton_check", sql`${t.id}`)]
);
