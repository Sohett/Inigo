-- INI-72: OAuth is the only way to connect Intervals.icu. Any API key still stored is dropped
-- (its athlete reconnects by link on their next exchange), then the column that told them apart.
DELETE FROM "athlete_credential" WHERE "auth_type" = 'api_key';--> statement-breakpoint
ALTER TABLE "athlete_credential" DROP CONSTRAINT "athlete_credential_auth_type_check";--> statement-breakpoint
ALTER TABLE "athlete_credential" DROP COLUMN "auth_type";
