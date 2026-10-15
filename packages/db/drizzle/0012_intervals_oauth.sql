ALTER TABLE "athlete_credential" ADD COLUMN "auth_type" text DEFAULT 'api_key' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_settings" ADD COLUMN "whatsapp_number" text;--> statement-breakpoint
ALTER TABLE "athlete_credential" ADD CONSTRAINT "athlete_credential_auth_type_check" CHECK ("athlete_credential"."auth_type" in ('api_key', 'oauth'));