import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IntervalsIcuClient, SportSettingsPatch } from "../../client";
import { runTool } from "../result";

export function registerAthleteTools(server: McpServer, client: IntervalsIcuClient): void {
  server.registerTool(
    "get_athlete_profile",
    {
      title: "Get athlete profile",
      description:
        "Get the athlete's profile: sport settings, FTP, threshold heart rate, training zones and personal details.",
      inputSchema: {}
    },
    () => runTool(() => client.getAthleteProfile())
  );
}

export function registerAthleteWriteTools(server: McpServer, client: IntervalsIcuClient): void {
  server.registerTool(
    "update_sport_settings",
    {
      title: "Update sport thresholds and zones",
      description:
        "Update the athlete's per-sport training thresholds and zones on Intervals.icu — the " +
        "source of truth used to compute activity metrics. Pass only the fields you want to " +
        "change; the rest of the athlete's settings are preserved (read-merge-write). Use this " +
        "when re-estimating physiology from a session (e.g. a new FTP).",
      inputSchema: {
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
          .describe("Pace zone bounds (replaces the current set)."),
        recalc_hr_zones: z
          .boolean()
          .optional()
          .describe(
            "When true, Intervals.icu recomputes HR zones from lthr/max_hr (overriding any hr_zones sent). Defaults to false."
          )
      }
    },
    ({ sport, recalc_hr_zones, ...patch }) =>
      runTool(() => {
        // `patch` is exactly the coach-controlled field set; the client overlays only the
        // provided (non-undefined) ones onto the athlete's current settings.
        const fields: SportSettingsPatch = patch;
        return client.updateSportSettings(sport, fields, recalc_hr_zones ?? false);
      })
  );
}
