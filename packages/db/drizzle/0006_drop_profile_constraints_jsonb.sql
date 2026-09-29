-- Carry weekly hours and equipment over to their new columns before the JSONB goes.
-- `fixedSlots` are not turned into rows (their `day` was free text): they are kept as prose in
-- `constraints_notes`, so nothing is lost and the agents still read them until they are
-- re-entered as `athlete_constraint` rows (INI-34).
UPDATE "athlete_profile" SET
	-- Guarded on the JSON type: a hand-written odd value is skipped, never aborts the migration.
	"weekly_hours" = CASE WHEN jsonb_typeof("constraints"->'weeklyHours') = 'number'
		THEN ("constraints"->>'weeklyHours')::numeric END,
	"equipment" = CASE WHEN jsonb_typeof("constraints"->'equipment') = 'array'
		THEN ARRAY(SELECT jsonb_array_elements_text("constraints"->'equipment')) END
WHERE "constraints" IS NOT NULL;--> statement-breakpoint
UPDATE "athlete_profile" SET
	"constraints_notes" = concat_ws(E'\n', "constraints_notes",
		'Créneaux fixes (ancien format, à ressaisir avec upsert_constraint) : ' || ("constraints"->'fixedSlots')::text)
WHERE jsonb_typeof("constraints"->'fixedSlots') = 'array' AND jsonb_array_length("constraints"->'fixedSlots') > 0;--> statement-breakpoint
-- Keep NULL (not an empty array) when no equipment was recorded.
UPDATE "athlete_profile" SET "equipment" = NULL WHERE "equipment" = '{}';--> statement-breakpoint
ALTER TABLE "athlete_profile" DROP COLUMN "constraints";
