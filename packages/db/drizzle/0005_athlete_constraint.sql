CREATE TABLE "athlete_constraint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"weekday" smallint,
	"start_date" date,
	"end_date" date,
	"activity" text,
	"start_time" time,
	"duration_min" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_constraint_kind_check" CHECK ("athlete_constraint"."kind" in ('fixed_session', 'unavailable', 'limited')),
	CONSTRAINT "athlete_constraint_activity_check" CHECK ("athlete_constraint"."activity" is null or "athlete_constraint"."activity" in ('strength', 'bike', 'run', 'swim')),
	CONSTRAINT "athlete_constraint_when_check" CHECK (("athlete_constraint"."weekday" is not null and "athlete_constraint"."weekday" between 1 and 7
          and "athlete_constraint"."start_date" is null and "athlete_constraint"."end_date" is null)
        or ("athlete_constraint"."weekday" is null and "athlete_constraint"."start_date" is not null and "athlete_constraint"."end_date" is not null
          and "athlete_constraint"."end_date" >= "athlete_constraint"."start_date")),
	CONSTRAINT "athlete_constraint_fixed_session_activity_check" CHECK ("athlete_constraint"."kind" <> 'fixed_session' or "athlete_constraint"."activity" is not null),
	CONSTRAINT "athlete_constraint_duration_check" CHECK ("athlete_constraint"."duration_min" is null or "athlete_constraint"."duration_min" > 0)
);
--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD COLUMN "weekly_hours" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD COLUMN "equipment" text[];--> statement-breakpoint
ALTER TABLE "athlete_constraint" ADD CONSTRAINT "athlete_constraint_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athlete_constraint_athlete_idx" ON "athlete_constraint" USING btree ("athlete_id");