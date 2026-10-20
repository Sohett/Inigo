-- INI-79: Inigo's WhatsApp number describes the gateway, not onboarding. Run right after the
-- deploy: the new code no longer reads onboarding_settings.whatsapp_number, while the old code
-- would break on its removal. The value is carried over to the existing gateway row (prod has
-- one, since the coach sends through its session).
ALTER TABLE "whatsapp_gateway" ADD COLUMN "whatsapp_number" text;--> statement-breakpoint
UPDATE "whatsapp_gateway" SET "whatsapp_number" = (SELECT "whatsapp_number" FROM "onboarding_settings" WHERE "onboarding_settings"."id");--> statement-breakpoint
ALTER TABLE "onboarding_settings" DROP COLUMN "whatsapp_number";
