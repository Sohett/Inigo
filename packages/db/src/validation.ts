import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { athlete } from "./schema/athlete";
import { athleteProfile } from "./schema/profile";
import { athleteThreshold } from "./schema/threshold";
import { goal } from "./schema/goal";
import { trainingPlan } from "./schema/plan";

/**
 * Zod schemas mirroring the tables, for validating inputs at the app boundary
 * (repo convention: validate all inputs with zod). Enum columns are enforced by DB
 * CHECK constraints; these schemas guard shape/required-ness before a write.
 *
 * The encrypted-credential path is intentionally excluded — secrets go through
 * `setIntervalsKey`, never a raw insert schema.
 */
export const insertAthleteSchema = createInsertSchema(athlete);
export const selectAthleteSchema = createSelectSchema(athlete);

export const insertAthleteProfileSchema = createInsertSchema(athleteProfile);
export const insertAthleteThresholdSchema = createInsertSchema(athleteThreshold);
export const insertGoalSchema = createInsertSchema(goal);
export const insertTrainingPlanSchema = createInsertSchema(trainingPlan);
