import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AthleteDataRepository } from "../repository/athleteDataRepository";
import type { ProfilePatch } from "../../domain/coaching";
import { FTP_STATUSES } from "../../domain/onboarding";
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
        "(display name, timezone, locale, status), target weight, weekly hours, equipment, " +
        "narrative constraints/health notes, coaching targets, onboarding answers (motivation, " +
        "training background, past coaching, expectations from Inigo, how the FTP was settled, " +
        "education done), and the active schedule constraints (every recurring one + dated ones " +
        "not yet over). This is the coaching layer (preferences, health rules, targets). " +
        "Physiology (sex, birth date, height, weight, resting/max HR) and live fitness/FTP/zones " +
        "come from the Intervals.icu MCP (get_athlete_profile, get_wellness).",
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
        "you pass change). Use for the display name, target weight, weekly hours, equipment, " +
        "health notes, coaching targets and the onboarding answers — not for physiology (sex, " +
        "birth date, height, weight: update_athlete_body on Intervals.icu), nor FTP/zones " +
        "(Intervals.icu), nor schedule rules (upsert_constraint). At least one field " +
        "beyond athleteId is required.",
      inputSchema: {
        ...athleteIdShape,
        displayName: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("How the athlete wants to be called (first name or nickname)."),
        weightTargetKg: z.number().positive().optional().describe("Target weight in kg."),
        weeklyHours: z.number().positive().max(99.9).optional().describe("Usual weekly training time, hours."),
        equipment: z.array(z.string()).optional().describe("Equipment at hand (replaces the list)."),
        constraintsNotes: z.string().optional().describe("Narrative availability context (prose)."),
        healthNotes: z
          .string()
          .optional()
          .describe("Active limitations and hard rules the coaching must respect (markdown)."),
        coachingTargets: coachingTargetsShape.optional(),
        motivation: z.string().min(1).optional().describe("Why the athlete came to Inigo, in their words."),
        trainingBackground: z
          .string()
          .min(1)
          .optional()
          .describe("Sporting background and current training volume."),
        pastCoaching: z
          .string()
          .min(1)
          .optional()
          .describe("Programmes, apps or coaches already tried, and what worked or not."),
        coachExpectations: z
          .string()
          .min(1)
          .optional()
          .describe("What the athlete expects from Inigo, in their words."),
        ftpStatus: z
          .enum(FTP_STATUSES)
          .optional()
          .describe(
            "How the bike FTP was settled: confirmed (and written on Intervals.icu), to_test " +
              "(a test in week 1) or heart_rate_only (no power meter)."
          ),
        educationDone: z
          .boolean()
          .optional()
          .describe("The athlete was walked through Intervals.icu and Inigo's way of coaching.")
      }
    },
    (args) =>
      runAthleteTool(store, args.athleteId, async (scoped) => {
        const patch: ProfilePatch = {};
        if (args.displayName !== undefined) patch.displayName = args.displayName;
        if (args.weightTargetKg !== undefined) patch.weightTargetKg = String(args.weightTargetKg);
        if (args.weeklyHours !== undefined) patch.weeklyHours = String(args.weeklyHours);
        if (args.equipment !== undefined) patch.equipment = args.equipment;
        if (args.constraintsNotes !== undefined) patch.constraintsNotes = args.constraintsNotes;
        if (args.healthNotes !== undefined) patch.healthNotes = args.healthNotes;
        if (args.coachingTargets !== undefined) patch.coachingTargets = args.coachingTargets;
        if (args.motivation !== undefined) patch.motivation = args.motivation;
        if (args.trainingBackground !== undefined) patch.trainingBackground = args.trainingBackground;
        if (args.pastCoaching !== undefined) patch.pastCoaching = args.pastCoaching;
        if (args.coachExpectations !== undefined) patch.coachExpectations = args.coachExpectations;
        if (args.ftpStatus !== undefined) patch.ftpStatus = args.ftpStatus;
        if (args.educationDone !== undefined) patch.educationDone = args.educationDone;
        if (Object.keys(patch).length === 0) {
          throw new Error("update_profile requires at least one field to update.");
        }
        return scoped.updateProfile(patch);
      })
  );
}
