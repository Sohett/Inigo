-- INI-72: OAuth is the only way to connect Intervals.icu, so nothing tells credentials apart any
-- more. Run right after the deploy. No DELETE here: once the new code is live it stops writing
-- auth_type, so an OAuth token stored before this runs would still read 'api_key' (the column
-- default) and be wiped. The API keys are removed by hand before the merge instead.
ALTER TABLE "athlete_credential" DROP CONSTRAINT "athlete_credential_auth_type_check";--> statement-breakpoint
ALTER TABLE "athlete_credential" DROP COLUMN "auth_type";
