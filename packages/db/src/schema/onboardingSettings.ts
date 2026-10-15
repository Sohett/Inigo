import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";

/**
 * How a new athlete is onboarded (INI-45). Exactly one row.
 *
 * Lives in the database rather than the environment for the same reason as `whatsapp_gateway`:
 * the agents evolve often and the access code may change, so the admin edits them in a form
 * instead of redeploying. Onboarding is only active once the onboarding agent and the access
 * code are both set. Nothing here is a secret.
 */
export const onboardingSettings = pgTable(
  "onboarding_settings",
  {
    /** Singleton key: `true` is the only accepted value, so the table cannot grow a second row. */
    id: boolean("id").primaryKey().default(true),
    /** The Managed Agent that runs a new athlete's onboarding session (`agent_…`). */
    onboardingAgentId: text("onboarding_agent_id"),
    /** The coordinator an athlete is handed to once onboarding is complete (`agent_…`, INI-49). */
    coordinatorAgentId: text("coordinator_agent_id"),
    /** The shared code an unknown number must send to start onboarding. */
    accessCode: text("access_code"),
    /**
     * Inigo's own WhatsApp number, E.164 (`+32475123456`): where a web page sends the athlete back
     * to the conversation (`wa.me`), e.g. after connecting Intervals.icu (INI-69).
     */
    whatsappNumber: text("whatsapp_number"),
    ...timestamps()
  },
  (t) => [check("onboarding_settings_singleton_check", sql`${t.id}`)]
);
