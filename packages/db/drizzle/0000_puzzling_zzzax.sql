CREATE TABLE "adaptation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"plan_id" uuid,
	"proposition_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author" text,
	"trigger" text,
	"summary" text NOT NULL,
	"detail" jsonb,
	"related_week" date,
	"intervals_event_ids" jsonb,
	CONSTRAINT "adaptation_log_trigger_check" CHECK ("adaptation_log"."trigger" is null or "adaptation_log"."trigger" in ('missed_session', 'low_readiness', 'illness', 'manual', 'scheduled'))
);
--> statement-breakpoint
CREATE TABLE "athlete" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text,
	"phone_num" text NOT NULL,
	"chat_id" text,
	"timezone" text DEFAULT 'Europe/Brussels' NOT NULL,
	"locale" text DEFAULT 'fr',
	"status" text DEFAULT 'active' NOT NULL,
	"anthropic_session_id" text,
	"managed_agent_id" text,
	"memory_store_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_phone_num_unique" UNIQUE("phone_num"),
	CONSTRAINT "athlete_status_check" CHECK ("athlete"."status" in ('active', 'paused', 'ended'))
);
--> statement-breakpoint
CREATE TABLE "athlete_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"provider" text DEFAULT 'intervals_icu' NOT NULL,
	"external_athlete_id" text,
	"secret_ciphertext" "bytea" NOT NULL,
	"secret_iv" "bytea" NOT NULL,
	"secret_auth_tag" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "athlete_credential_provider_unique" UNIQUE("athlete_id","provider"),
	CONSTRAINT "athlete_credential_provider_check" CHECK ("athlete_credential"."provider" in ('intervals_icu'))
);
--> statement-breakpoint
CREATE TABLE "athlete_profile" (
	"athlete_id" uuid PRIMARY KEY NOT NULL,
	"birth_date" date,
	"sex" text,
	"height_cm" numeric(5, 2),
	"weight_kg" numeric(5, 2),
	"weight_target_kg" numeric(5, 2),
	"resting_hr" integer,
	"max_hr" integer,
	"constraints" jsonb,
	"constraints_notes" text,
	"health_notes" text,
	"coaching_targets" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_profile_sex_check" CHECK ("athlete_profile"."sex" is null or "athlete_profile"."sex" in ('M', 'F', 'other'))
);
--> statement-breakpoint
CREATE TABLE "athlete_threshold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"sport" text DEFAULT 'bike' NOT NULL,
	"ftp_watts" integer,
	"threshold_hr" integer,
	"max_hr" integer,
	"threshold_pace_s_per_km" integer,
	"power_zones" jsonb,
	"hr_zones" jsonb,
	"source" text,
	"effective_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_threshold_effective_unique" UNIQUE("athlete_id","sport","effective_date"),
	CONSTRAINT "athlete_threshold_sport_check" CHECK ("athlete_threshold"."sport" in ('bike', 'run', 'swim')),
	CONSTRAINT "athlete_threshold_source_check" CHECK ("athlete_threshold"."source" is null or "athlete_threshold"."source" in ('test', 'estimated', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text,
	"target_date" date,
	"priority" text,
	"status" text DEFAULT 'active' NOT NULL,
	"intervals_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_type_check" CHECK ("goal"."type" is null or "goal"."type" in ('event', 'performance', 'health')),
	CONSTRAINT "goal_priority_check" CHECK ("goal"."priority" is null or "goal"."priority" in ('A', 'B', 'C')),
	CONSTRAINT "goal_status_check" CHECK ("goal"."status" in ('active', 'achieved', 'abandoned'))
);
--> statement-breakpoint
CREATE TABLE "plan_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text,
	"phase_type" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"focus" text,
	"order_index" integer NOT NULL,
	"weekly_targets" jsonb,
	CONSTRAINT "plan_block_phase_type_check" CHECK ("plan_block"."phase_type" is null or "plan_block"."phase_type" in ('base', 'build', 'peak', 'taper', 'transition')),
	CONSTRAINT "plan_block_dates_check" CHECK ("plan_block"."end_date" >= "plan_block"."start_date")
);
--> statement-breakpoint
CREATE TABLE "training_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"goal_id" uuid,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_plan_status_check" CHECK ("training_plan"."status" in ('draft', 'active', 'completed', 'archived')),
	CONSTRAINT "training_plan_created_by_check" CHECK ("training_plan"."created_by" is null or "training_plan"."created_by" in ('ai', 'coach', 'system')),
	CONSTRAINT "training_plan_dates_check" CHECK ("training_plan"."end_date" >= "training_plan"."start_date")
);
--> statement-breakpoint
CREATE TABLE "weekly_proposition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"plan_id" uuid,
	"block_id" uuid,
	"week_start" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"payload" jsonb,
	"validator_result" jsonb,
	"rationale" text,
	"intervals_event_ids" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "weekly_proposition_status_check" CHECK ("weekly_proposition"."status" in ('draft', 'validated', 'applied', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "adaptation_log" ADD CONSTRAINT "adaptation_log_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptation_log" ADD CONSTRAINT "adaptation_log_plan_id_training_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."training_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptation_log" ADD CONSTRAINT "adaptation_log_proposition_id_weekly_proposition_id_fk" FOREIGN KEY ("proposition_id") REFERENCES "public"."weekly_proposition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_credential" ADD CONSTRAINT "athlete_credential_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD CONSTRAINT "athlete_profile_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_threshold" ADD CONSTRAINT "athlete_threshold_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_block" ADD CONSTRAINT "plan_block_plan_id_training_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."training_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan" ADD CONSTRAINT "training_plan_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plan" ADD CONSTRAINT "training_plan_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_proposition" ADD CONSTRAINT "weekly_proposition_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_proposition" ADD CONSTRAINT "weekly_proposition_plan_id_training_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."training_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_proposition" ADD CONSTRAINT "weekly_proposition_block_id_plan_block_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."plan_block"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adaptation_log_athlete_idx" ON "adaptation_log" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_credential_athlete_idx" ON "athlete_credential" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_threshold_athlete_idx" ON "athlete_threshold" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "goal_athlete_idx" ON "goal" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "plan_block_plan_idx" ON "plan_block" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "training_plan_athlete_idx" ON "training_plan" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "weekly_proposition_athlete_week_idx" ON "weekly_proposition" USING btree ("athlete_id","week_start");