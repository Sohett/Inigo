CREATE TABLE "whatsapp_gateway" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_gateway_singleton_check" CHECK ("whatsapp_gateway"."id")
);
