CREATE TABLE "onboarding_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"onboarding_agent_id" text,
	"coordinator_agent_id" text,
	"access_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_settings_singleton_check" CHECK ("onboarding_settings"."id")
);
--> statement-breakpoint
ALTER TABLE "athlete" ALTER COLUMN "phone_num" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "athlete" ADD CONSTRAINT "athlete_routing_key_check" CHECK ("athlete"."phone_num" is not null or "athlete"."whatsapp_lid" is not null);