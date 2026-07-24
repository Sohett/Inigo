/**
 * @inigo/db — the shared Neon schema, Drizzle client, and secret helpers.
 *
 * The single owner of the coaching database schema and its migrations. Consumers
 * (`coach` today, `athlete-mcp` next) import from here; they never redefine tables.
 */
export * from "./schema";
export { createDb, type Db } from "./client";
export { sealSecret, openSecret, generateMasterKey, type SealedSecret } from "./crypto";
export { getIntervalsKey, setIntervalsKey, type IntervalsCredential } from "./credentials";
export {
  insertAthleteSchema,
  selectAthleteSchema,
  insertAthleteProfileSchema,
  insertAthleteThresholdSchema,
  insertGoalSchema,
  insertTrainingPlanSchema,
  insertPlanBlockSchema
} from "./validation";
