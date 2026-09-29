-- Carry weekly hours and equipment over to their new columns before the JSONB goes.
-- `fixedSlots` are deliberately not migrated: their `day` was free text; the few existing
-- slots are re-entered as `athlete_constraint` rows after deploy (INI-34).
UPDATE "athlete_profile" SET
	"weekly_hours" = ("constraints"->>'weeklyHours')::numeric,
	"equipment" = ARRAY(SELECT jsonb_array_elements_text("constraints"->'equipment'))
WHERE "constraints" IS NOT NULL;--> statement-breakpoint
-- Keep NULL (not an empty array) when no equipment was recorded.
UPDATE "athlete_profile" SET "equipment" = NULL WHERE "equipment" = '{}';--> statement-breakpoint
ALTER TABLE "athlete_profile" DROP COLUMN "constraints";
