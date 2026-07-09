ALTER TABLE "athlete" ADD COLUMN "whatsapp_lid" text;--> statement-breakpoint
ALTER TABLE "athlete" ADD CONSTRAINT "athlete_whatsapp_lid_unique" UNIQUE("whatsapp_lid");