CREATE TABLE "athlete_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"anthropic_session_id" text NOT NULL,
	"managed_agent_id" text NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_session_anthropic_session_id_unique" UNIQUE("anthropic_session_id")
);
--> statement-breakpoint
ALTER TABLE "athlete_session" ADD CONSTRAINT "athlete_session_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athlete_session_athlete_idx" ON "athlete_session" USING btree ("athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_session_one_active_idx" ON "athlete_session" USING btree ("athlete_id") WHERE "athlete_session"."ended_at" is null;--> statement-breakpoint
-- Carry each athlete's current session over as its active session before the inline
-- columns go. A session without its agent id violates NOT NULL and aborts the migration:
-- loud on purpose, rather than silently dropping a live session.
INSERT INTO "athlete_session" ("athlete_id", "anthropic_session_id", "managed_agent_id")
SELECT "id", "anthropic_session_id", "managed_agent_id" FROM "athlete" WHERE "anthropic_session_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "athlete" DROP COLUMN "anthropic_session_id";--> statement-breakpoint
ALTER TABLE "athlete" DROP COLUMN "managed_agent_id";--> statement-breakpoint
ALTER TABLE "athlete" DROP COLUMN "memory_store_id";