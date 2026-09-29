import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AthleteDataRepository } from "../repository/athleteDataRepository";
import type { ProfilePatch } from "../../domain/coaching";
import { athleteIdShape, runAthleteTool } from "./result";

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
        "height, reference weight + target, resting/max HR), weekly hours, equipment, " +
        "narrative constraints/health notes, coaching targets, and the active schedule " +
        "constraints (every recurring one + dated ones not yet over). This is the coaching layer " +
        "(preferences, health rules, targets) — live fitness/FTP/zones come from the Intervals.icu MCP.",
      inputSchema: { ...athleteIdShape }
    },
    (args) => runAthleteTool(store, args.athleteId, (scoped) => scoped.getProfile())
  );
}

export function registerProfileWriteTools(server: McpServer, store: AthleteDataRepository): void {
  server.registerTool(
    "update_profile",
    {
      title: "Update athlete profile notes & preferences",
      description:
        "Update simple notes/preferences on the athlete's profile (upsert; only the fields " +
        "you pass change). Use for target weight, weekly hours, equipment, health notes and " +
        "coaching targets — not for FTP/zones (those are historised via thresholds and computed " +
        "by Intervals.icu), nor for schedule rules (upsert_constraint). At least one field " +
        "beyond athleteId is required.",
      inputSchema: {
        ...athleteIdShape,
        weightTargetKg: z.number().positive().optional().describe("Target weight in kg."),
        weeklyHours: z.number().positive().max(99.9).optional().describe("Usual weekly training time, hours."),
        equipment: z.array(z.string()).optional().describe("Equipment at hand (replaces the list)."),
        constraintsNotes: z.string().optional().describe("Narrative availability context (prose)."),
        healthNotes: z
          .string()
          .optional()
          .describe("Active limitations and hard rules the coaching must respect (markdown)."),
        coachingTargets: coachingTargetsShape.optional()
      }
    },
    (args) =>
      runAthleteTool(store, args.athleteId, async (scoped) => {
        const patch: ProfilePatch = {};
        if (args.weightTargetKg !== undefined) patch.weightTargetKg = String(args.weightTargetKg);
        if (args.weeklyHours !== undefined) patch.weeklyHours = String(args.weeklyHours);
        if (args.equipment !== undefined) patch.equipment = args.equipment;
        if (args.constraintsNotes !== undefined) patch.constraintsNotes = args.constraintsNotes;
        if (args.healthNotes !== undefined) patch.healthNotes = args.healthNotes;
        if (args.coachingTargets !== undefined) patch.coachingTargets = args.coachingTargets;
        if (Object.keys(patch).length === 0) {
          throw new Error("update_profile requires at least one field to update.");
        }
        return scoped.updateProfile(patch);
      })
  );
}
