ALTER TABLE "athlete" DROP CONSTRAINT "athlete_status_check";--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD COLUMN "motivation" text;--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD COLUMN "training_background" text;--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD COLUMN "ftp_status" text;--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD COLUMN "education_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "athlete" ADD CONSTRAINT "athlete_status_check" CHECK ("athlete"."status" in ('onboarding', 'active', 'paused', 'ended'));--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD CONSTRAINT "athlete_profile_ftp_status_check" CHECK ("athlete_profile"."ftp_status" is null or "athlete_profile"."ftp_status" in ('confirmed', 'to_test', 'heart_rate_only'));