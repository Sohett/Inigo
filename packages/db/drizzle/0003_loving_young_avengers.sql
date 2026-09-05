CREATE TABLE "brain_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"coordinator_agent_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"vault_ids" text[] DEFAULT '{}' NOT NULL,
	"memory_store_id" text,
	"memory_store_access" text DEFAULT 'read_only' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_config_singleton_check" CHECK ("brain_config"."id" = 'default'),
	CONSTRAINT "brain_config_memory_access_check" CHECK ("brain_config"."memory_store_access" in ('read_only', 'read_write'))
);
--> statement-breakpoint
-- Seed the single row from tooling/brain/deploy.manifest.json, so every environment
-- has a usable brain template as soon as the migration runs. Idempotent.
INSERT INTO "brain_config" (
	"id", "coordinator_agent_id", "environment_id", "vault_ids", "memory_store_id", "memory_store_access"
) VALUES (
	'default',
	'agent_013Cb3npXSMv7T8X533DL9kt',
	'env_01AZaYzuAgRrayUXudep4dtG',
	'{"vlt_011CcZTB2pGvyiFispE829k8"}',
	'memstore_01Ad3wALLarbS97RbVjT1Hbo',
	'read_only'
) ON CONFLICT ("id") DO NOTHING;
