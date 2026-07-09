import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import type { AthleteStatus } from "./types";

/**
 * The athlete: identity, WhatsApp routing, and pointers into the Managed Agent
 * control plane. This is the routing core (INI-5: a message reaches the right
 * session via `phoneNum`; a CRON resumes a conversation via `anthropicSessionId`).
 *
 * One athlete = one conversation/session in this phase, so the session/agent
 * pointers live inline — no premature multi-session abstraction.
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
    /** Managed Agent session (`sesn_…`) this athlete's messages are appended to. */
    anthropicSessionId: text("anthropic_session_id"),
    /** Managed Agent (`agent_…`), the coordinator. */
    managedAgentId: text("managed_agent_id"),
    /** Legacy per-athlete memory store (`memstore_…`), kept for ops/routing. */
    memoryStoreId: text("memory_store_id"),
    ...timestamps()
  },
  (t) => [check("athlete_status_check", sql`${t.status} in ('active', 'paused', 'ended')`)]
);
