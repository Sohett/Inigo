import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AthleteDataRepository } from "../repository/athleteDataRepository";
import type { ProfilePatch } from "../../domain/coaching";
import { athleteIdShape, runTool } from "./result";

const constraintsShape = z
  .object({
    weeklyHours: z.number().positive().optional(),
    fixedSlots: z
      .array(
        z.object({
          day: z.string(),
          start: z.string().optional(),
          durationMin: z.number().int().positive().optional()
        })
      )
      .optional(),
    equipment: z.array(z.string()).optional()
  })
  .describe("Machine-checkable availability: weekly hours, fixed slots, equipment.");

const coachingTargetsShape = z
  .object({
    peakEvent: z.string().optional(),
    ctlPeakTarget: z.number().optional(),
    rampMax: z.number().optional(),
    tsbWindow: z.tuple([z.number(), z.number()]).optional()
  })
  .describe("Coaching config derived from goals (peak event, CTL peak target, ramp max, TSB window).");

export function registerProfileReadTools(server: McpServer, store: AthleteDataRepository): void {
  server.registerTool(
    "get_profile",
    {
      title: "Get athlete coaching profile",
      description:
        "Read the athlete's structured coaching profile from the shared DB: identity " +
        "(display name, timezone, locale, status), physiology reference (birth date, sex, " +
        "height, reference weight + target, resting/max HR), machine-checkable constraints, " +
        "narrative constraints/health notes, and coaching targets. This is the coaching layer " +
        "(preferences, health rules, targets) — live fitness/FTP/zones come from the Intervals.icu MCP.",
      inputSchema: { ...athleteIdShape }
    },
    (args) => runTool(() => store.forAthlete(args.athleteId).getProfile())
  );
}

export function registerProfileWriteTools(server: McpServer, store: AthleteDataRepository): void {
  server.registerTool(
    "update_profile",
    {
      title: "Update athlete profile notes & preferences",
      description:
        "Update simple notes/preferences on the athlete's profile (upsert; only the fields " +
        "you pass change). Use for target weight, availability constraints, health notes and " +
        "coaching targets — not for FTP/zones (those are historised via thresholds and computed " +
        "by Intervals.icu). At least one field beyond athleteId is required.",
      inputSchema: {
        ...athleteIdShape,
        weightTargetKg: z.number().positive().optional().describe("Target weight in kg."),
        constraints: constraintsShape.optional(),
        constraintsNotes: z.string().optional().describe("Narrative availability constraints (prose)."),
        healthNotes: z
          .string()
          .optional()
          .describe("Active limitations and hard rules the coaching must respect (markdown)."),
        coachingTargets: coachingTargetsShape.optional()
      }
    },
    (args) =>
      runTool(async () => {
        const patch: ProfilePatch = {};
        if (args.weightTargetKg !== undefined) patch.weightTargetKg = String(args.weightTargetKg);
        if (args.constraints !== undefined) patch.constraints = args.constraints;
        if (args.constraintsNotes !== undefined) patch.constraintsNotes = args.constraintsNotes;
        if (args.healthNotes !== undefined) patch.healthNotes = args.healthNotes;
        if (args.coachingTargets !== undefined) patch.coachingTargets = args.coachingTargets;
        if (Object.keys(patch).length === 0) {
          throw new Error("update_profile requires at least one field to update.");
        }
        return store.forAthlete(args.athleteId).updateProfile(patch);
      })
  );
}
