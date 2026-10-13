ALTER TABLE "athlete_profile" DROP CONSTRAINT "athlete_profile_sex_check";--> statement-breakpoint
ALTER TABLE "goal" ADD COLUMN "target_result" text;--> statement-breakpoint
ALTER TABLE "goal" ADD COLUMN "experience" text;--> statement-breakpoint
ALTER TABLE "athlete_profile" DROP COLUMN "birth_date";--> statement-breakpoint
ALTER TABLE "athlete_profile" DROP COLUMN "sex";--> statement-breakpoint
ALTER TABLE "athlete_profile" DROP COLUMN "height_cm";--> statement-breakpoint
ALTER TABLE "athlete_profile" DROP COLUMN "weight_kg";--> statement-breakpoint
ALTER TABLE "athlete_profile" DROP COLUMN "resting_hr";--> statement-breakpoint
ALTER TABLE "athlete_profile" DROP COLUMN "max_hr";