import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AthleteDataRepository } from "../repository/athleteDataRepository";
import type { ConstraintInput } from "../../domain/coaching";
import { createSaveAthleteConstraint } from "../../use-cases/saveAthleteConstraint";
import { createDeleteAthleteConstraint } from "../../use-cases/deleteAthleteConstraint";
import { dateString } from "./plan";
import { assertAthleteId, athleteIdShape, runTool } from "./result";

/**
 * Write side of the schedule constraints. There is no read tool: the active constraints come
 * back with `get_profile`, which every specialist already calls, so reading them costs no
 * extra round-trip. Rules are validated by the `saveAthleteConstraint` use-case; this layer
 * only maps its outcome onto the MCP result. `runTool` + `assertAthleteId` rather than
 * `runAthleteTool`: the use-cases scope the store themselves.
 */
export function registerConstraintWriteTools(server: McpServer, store: AthleteDataRepository): void {
  const saveConstraint = createSaveAthleteConstraint({ repo: store });
  const deleteConstraint = createDeleteAthleteConstraint({ repo: store });

  server.registerTool(
    "upsert_constraint",
    {
      title: "Create or replace a schedule constraint",
      description:
        "Save one schedule rule. Recurring: pass `weekday` (1 = Monday … 7 = Sunday). Dated: " +
        "pass `startDate` + `endDate` (inclusive). Pass `id` to replace an existing rule whole " +
        "(omitted fields are cleared). Active rules come back in `get_profile.constraints`.",
      inputSchema: {
        ...athleteIdShape,
        // Plain strings, like athleteId: a uuid regex in the schema is re-read on every request.
        id: z.string().optional().describe("Constraint id to replace; omit to create."),
        kind: z
          .enum(["fixed_session", "unavailable", "limited"])
          .describe(
            "fixed_session = a session that must happen on this slot (set activity); " +
              "unavailable = no session at all; limited = reduced time or conditions (say which in note)."
          ),
        weekday: z.number().int().min(1).max(7).optional(),
        startDate: dateString.optional(),
        endDate: dateString.optional(),
        activity: z.enum(["strength", "bike", "run", "swim"]).optional(),
        startTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24h).")
          .optional(),
        durationMin: z.number().int().positive().optional(),
        note: z.string().max(200).optional().describe("Short context, e.g. \"Alpes, outdoor only\".")
      }
    },
    (args) =>
      runTool(async () => {
        const { athleteId, ...fields } = args;
        assertAthleteId(athleteId);
        const input: ConstraintInput = { kind: fields.kind };
        if (fields.id !== undefined) input.id = fields.id;
        if (fields.weekday !== undefined) input.weekday = fields.weekday;
        if (fields.startDate !== undefined) input.startDate = fields.startDate;
        if (fields.endDate !== undefined) input.endDate = fields.endDate;
        if (fields.activity !== undefined) input.activity = fields.activity;
        if (fields.startTime !== undefined) input.startTime = fields.startTime;
        if (fields.durationMin !== undefined) input.durationMin = fields.durationMin;
        if (fields.note !== undefined) input.note = fields.note;

        const outcome = await saveConstraint.execute(athleteId, input);
        if (outcome.status === "invalid") throw new Error(outcome.reason);
        if (outcome.status === "not_found") {
          throw new Error(`Constraint ${input.id} not found for this athlete.`);
        }
        return outcome.constraint;
      })
  );

  server.registerTool(
    "delete_constraint",
    {
      title: "Delete a schedule constraint",
      description:
        "Delete a schedule rule that no longer applies. Dated rules need no cleanup once " +
        "over: they drop out of get_profile by themselves.",
      inputSchema: {
        ...athleteIdShape,
        id: z.string().describe("Constraint id, from get_profile.constraints.")
      }
    },
    (args) =>
      runTool(async () => {
        assertAthleteId(args.athleteId);
        const outcome = await deleteConstraint.execute(args.athleteId, args.id);
        if (outcome.status === "not_found") {
          throw new Error(`Constraint ${args.id} not found for this athlete.`);
        }
        return { deleted: true };
      })
  );
}
