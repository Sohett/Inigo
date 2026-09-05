/**
 * V0 schema barrel. Ten tables owned by Neon: the athlete core (identity/routing,
 * secret, profile, historised thresholds, goals), the coaching output (macro-plan,
 * blocks, weekly propositions, adaptation journal), and the brain session template.
 *
 * Deliberately NOT here (owned by Intervals.icu, never duplicated): activities,
 * daily PMC (CTL/ATL/TSB), power/HR/pace curves, and the planned-session calendar.
 * The `flag` signals table is V0+ and lands in a dedicated issue.
 */
export { athlete } from "./athlete";
export { athleteCredential } from "./credential";
export { athleteProfile } from "./profile";
export { athleteThreshold } from "./threshold";
export { goal } from "./goal";
export { trainingPlan, planBlock } from "./plan";
export { weeklyProposition } from "./proposition";
export { adaptationLog } from "./adaptationLog";
export { brainConfig } from "./brainConfig";

export * from "./types";
