import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import type { AthleteStatus } from "./types";

/**
 * The athlete: identity and WhatsApp routing. This is the routing core (INI-5: a
 * message reaches the right athlete via `phoneNum` or `whatsappLid`).
 *
 * The Managed Agent sessions the athlete is routed to live in `athlete_session`,
 * which keeps the history and marks the live one.
 */
export const athlete = pgTable(
  "athlete",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name"),
    /** WhatsApp number in E.164. A routing key. */
    phoneNum: text("phone_num").notNull().unique(),
    /**
     * WhatsApp LID JID (`…@lid`) when the sender is identified by a linked id
     * rather than a phone number (WhatsApp's privacy addressing). A routing key
     * alongside `phone_num`; stored as the full JID (opaque token, no E.164 form)
     * so it never collides with a phone number. Null until known (seed or onboarding).
     */
    whatsappLid: text("whatsapp_lid").unique(),
    /** WhatsApp chat id the agent replies to (nullable until the first message). */
    chatId: text("chat_id"),
    timezone: text("timezone").notNull().default("Europe/Brussels"),
    locale: text("locale").default("fr"),
    status: text("status").$type<AthleteStatus>().notNull().default("active"),
    ...timestamps()
  },
  (t) => [check("athlete_status_check", sql`${t.status} in ('active', 'paused', 'ended')`)]
);
