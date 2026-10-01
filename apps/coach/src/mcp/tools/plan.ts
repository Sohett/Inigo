import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AthleteDataRepository } from "../repository/athleteDataRepository";
import type { TrainingPlan, TrainingPlanInput } from "../../domain/coaching";
import { createSaveTrainingPlan } from "../../use-cases/saveTrainingPlan";
import { assertAthleteId, athleteIdShape, runAthleteTool, runTool } from "./result";

export function registerPlanTools(server: McpServer, store: AthleteDataRepository): void {
  server.registerTool(
    "get_training_plan",
    {
      title: "Get current training plan",
      description:
        "Read the athlete's current macro training plan (the active plan if any, else the most " +
        "recent) with its ordered blocks/mesocycles and their weekly targets. The concrete, " +
        "gate-validated weekly sessions and the live calendar live on Intervals.icu.",
      inputSchema: { ...athleteIdShape }
    },
    (args) => runAthleteTool(store, args.athleteId, (scoped) => scoped.getTrainingPlan())
  );
}

/** A plain YYYY-MM-DD date (no time component — Postgres `date`). */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be a plain calendar date, YYYY-MM-DD (no time).");

const weeklyTargetSchema = z.object({
  weekStart: dateString.describe("Monday of the target week, YYYY-MM-DD."),
  plannedTss: z.number().optional(),
  plannedDurationS: z.number().optional(),
  focus: z.string().optional(),
  keySessions: z.string().optional().describe("The week's key sessions as free text."),
  ctlTarget: z.number().optional().describe("Projected end-of-week CTL from the plan.")
});

const planBlockSchema = z.object({
  name: z.string().optional(),
  phaseType: z.enum(["base", "build", "peak", "taper", "transition"]).optional(),
  startDate: dateString,
  endDate: dateString.describe("Block end date, YYYY-MM-DD (>= startDate)."),
  focus: z.string().optional(),
  weeklyTargets: z.array(weeklyTargetSchema).optional().describe("Per-week targets inside the block.")
});

/**
 * `runTool` + `assertAthleteId` rather than `runAthleteTool`: the `saveTrainingPlan` use-case
 * scopes the store itself and owns the goal-link rule; this layer only maps its outcome.
 */
export function registerPlanWriteTools(server: McpServer, store: AthleteDataRepository): void {
  const savePlan = createSaveTrainingPlan({ repo: store });

  server.registerTool(
    "save_training_plan",
    {
      title: "Create or update the training plan (master plan)",
      description:
        "Create a macro training plan (omit `id`) or update an existing one (pass its `id`), " +
        "together with its ordered blocks/mesocycles, in one atomic write. `blocks` is " +
        "replace-all: the list you pass fully replaces the plan's blocks and their order. " +
        "Setting `status` to `active` archives the athlete's other active plans. The plan is the " +
        "macro strategy (phases + weekly targets); the concrete gate-validated week and the " +
        "Intervals.icu calendar are written elsewhere — do not duplicate them here. A new plan " +
        "must pass `goalId`. An update to an id that is not this athlete's plan fails without " +
        "touching any data.",
      inputSchema: {
        ...athleteIdShape,
        id: z.string().uuid().optional().describe("Plan id to update; omit to create a new plan."),
        name: z.string().min(1).describe("Plan name."),
        startDate: dateString.describe("Plan start date, YYYY-MM-DD."),
        endDate: dateString.describe("Plan end date, YYYY-MM-DD (>= startDate)."),
        status: z
          .enum(["draft", "active", "completed", "archived"])
          .optional()
          .describe("Defaults to draft on create. `active` archives the athlete's other active plans."),
        createdBy: z.enum(["ai", "coach", "system"]).optional().describe("Defaults to ai on create."),
        goalId: z
          .string()
          .uuid()
          .nullable()
          .optional()
          .describe(
            "Required on create: the active goal this plan serves (id from get_goals), or null " +
              "if the athlete has no goal. On update, omit to keep the link, null to unlink."
          ),
        rationale: z
          .string()
          .optional()
          .describe("Full macro-plan narrative: strategy, per-phase intentions, open questions."),
        blocks: z
          .array(planBlockSchema)
          .min(1)
          .describe("Ordered mesocycle blocks. Replaces the plan's existing blocks (replace-all).")
      }
    },
    (args) =>
      runTool(async (): Promise<TrainingPlan> => {
        assertAthleteId(args.athleteId);
        const input: TrainingPlanInput = {
          name: args.name,
          startDate: args.startDate,
          endDate: args.endDate,
          blocks: args.blocks
        };
        if (args.id !== undefined) input.id = args.id;
        if (args.status !== undefined) input.status = args.status;
        if (args.createdBy !== undefined) input.createdBy = args.createdBy;
        if (args.goalId !== undefined) input.goalId = args.goalId;
        if (args.rationale !== undefined) input.rationale = args.rationale;

        const outcome = await savePlan.execute(args.athleteId, input);
        switch (outcome.status) {
          case "saved":
            return outcome.plan;
          case "invalid":
            throw new Error(outcome.reason);
          case "not_found":
            throw new Error(`Training plan ${input.id} not found for this athlete.`);
        }
      })
  );
}
