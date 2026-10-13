import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AthleteBodyPatch } from "../../client";
import { athleteIdShape, runAthleteTool, type ResolveClient } from "../result";

export function registerAthleteTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "get_athlete_profile",
    {
      title: "Get athlete profile",
      description:
        "Get the athlete's profile: sport settings, FTP, threshold heart rate, training zones and personal details.",
      inputSchema: { ...athleteIdShape }
    },
    (args) => runAthleteTool(resolve, args.athleteId, (client) => client.getAthleteProfile())
  );
}

export function registerAthleteWriteTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "update_sport_settings",
    {
      title: "Update sport thresholds and zones",
      description:
        "Update the athlete's per-sport training thresholds and zones on Intervals.icu, the " +
        "source of truth used to compute activity metrics. Pass only the fields you want to " +
        "change (partial update); the other settings are left untouched. Use this when " +
        "re-estimating physiology from a session (e.g. a new FTP).",
      inputSchema: {
        ...athleteIdShape,
        sport: z
          .enum(["Ride", "Run", "Swim"])
          .describe("Intervals.icu activity type whose settings to update."),
        ftp: z.number().int().positive().optional().describe("Functional Threshold Power, watts."),
        indoor_ftp: z.number().int().positive().optional().describe("Indoor FTP, watts."),
        lthr: z.number().int().positive().optional().describe("Lactate threshold heart rate, bpm."),
        max_hr: z.number().int().positive().optional().describe("Max heart rate, bpm."),
        threshold_pace: z
          .number()
          .positive()
          .optional()
          .describe("Threshold pace, seconds per metre (Intervals.icu unit)."),
        power_zones: z
          .array(z.number())
          .optional()
          .describe("Power zone upper bounds (replaces the current set)."),
        hr_zones: z
          .array(z.number())
          .optional()
          .describe("HR zone upper bounds (replaces the current set)."),
        pace_zones: z
          .array(z.number())
          .optional()
          .describe("Pace zone bounds (replaces the current set).")
      }
    },
    ({ athleteId, sport, ...patch }) =>
      runAthleteTool(resolve, athleteId, (client) => client.updateSportSettings(sport, patch))
  );

  server.registerTool(
    "update_athlete_body",
    {
      title: "Update the athlete's physiology",
      description:
        "Write the athlete's sex, birth date, height and weight on Intervals.icu, the only place " +
        "they are kept (never in the coaching profile). Pass only the fields to set; the others " +
        "are left untouched. Use it to fill in what get_athlete_profile shows as missing.",
      inputSchema: {
        ...athleteIdShape,
        sex: z.enum(["M", "F"]).optional().describe("M or F."),
        birthDate: z.iso.date().optional().describe("Birth date, YYYY-MM-DD."),
        heightCm: z.number().min(100).max(250).optional().describe("Height in centimetres."),
        weightKg: z.number().min(25).max(300).optional().describe("Weight in kilograms.")
      }
    },
    ({ athleteId, sex, birthDate, heightCm, weightKg }) =>
      runAthleteTool(resolve, athleteId, async (client) => {
        const patch: AthleteBodyPatch = {};
        if (sex !== undefined) patch.sex = sex;
        if (birthDate !== undefined) patch.icu_date_of_birth = birthDate;
        // Intervals.icu keeps the height in metres.
        if (heightCm !== undefined) patch.height = heightCm / 100;
        if (weightKg !== undefined) patch.icu_weight = weightKg;
        if (Object.keys(patch).length === 0) {
          throw new Error("update_athlete_body requires at least one field to update.");
        }
        return client.updateAthlete(patch);
      })
  );
}
