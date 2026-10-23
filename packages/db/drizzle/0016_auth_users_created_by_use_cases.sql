-- INI-87: a user is never created by signing in, only by our use-cases, through Better Auth's
-- admin plugin. A staff member is a user from their invitation on (role 'admin', 'coach' or
-- 'admin,coach'), so staff_member goes: its members become invited users here (email not yet
-- verified: Google verifies it, and links their account, on their first sign in). Adds the admin
-- plugin's columns. Run it before the deploy: the new code no longer reads staff_member.
ALTER TABLE "auth_user" DROP CONSTRAINT "auth_user_role_check";--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "banned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "ban_expires" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "invited_by" text;--> statement-breakpoint
UPDATE "auth_user" SET "role" = array_to_string(ARRAY(SELECT r FROM unnest("staff_member"."roles") r ORDER BY r), ','), "invited_by" = "staff_member"."invited_by" FROM "staff_member" WHERE "auth_user"."email" = "staff_member"."email" AND "auth_user"."role" = 'staff';--> statement-breakpoint
DELETE FROM "auth_user" WHERE "role" = 'staff';--> statement-breakpoint
INSERT INTO "auth_user" ("id", "name", "email", "email_verified", "role", "invited_by", "created_at", "updated_at")
SELECT gen_random_uuid()::text, '', "email", false, array_to_string(ARRAY(SELECT r FROM unnest("roles") r ORDER BY r), ','), "invited_by", "invited_at", now() FROM "staff_member"
WHERE NOT EXISTS (SELECT 1 FROM "auth_user" WHERE "auth_user"."email" = "staff_member"."email");--> statement-breakpoint
ALTER TABLE "auth_user" ADD CONSTRAINT "auth_user_email_lowercase_check" CHECK ("auth_user"."email" = lower("auth_user"."email"));--> statement-breakpoint
ALTER TABLE "auth_user" ADD CONSTRAINT "auth_user_role_check" CHECK ("auth_user"."role" in ('athlete', 'admin', 'coach', 'admin,coach'));--> statement-breakpoint
DROP TABLE "staff_member";
