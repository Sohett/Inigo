import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AthleteDataRepository } from "../repository/athleteDataRepository";
import type { AdaptationLogInput } from "../../domain/coaching";
import { athleteIdShape, runAthleteTool } from "./result";

export function registerAdaptationLogReadTools(server: McpServer, store: AthleteDataRepository): void {
  server.registerTool(
    "get_adaptation_log",
    {
      title: "Get adaptation log",
      description:
        "Read the athlete's coaching journal (append-only): recent adaptation decisions with their " +
        "trigger and rationale, newest first.",
      inputSchema: {
        ...athleteIdShape,
        limit: z
          .number()
          .int()
          .positive()
          .max(30)
          .optional()
          .describe("Maximum number of entries (default 5, max 30)."),
        since: z.string().optional().describe("Only entries on/after this ISO date/datetime.")
      }
    },
    (args) =>
      runAthleteTool(store, args.athleteId, (scoped) =>
        scoped.getAdaptationLog({ limit: args.limit, since: args.since })
      )
  );
}

export function registerAdaptationLogWriteTools(server: McpServer, store: AthleteDataRepository): void {
  server.registerTool(
    "log_adaptation",
    {
      title: "Append an adaptation-log entry",
      description:
        "Append one entry to the athlete's coaching journal (append-only, never edits an existing " +
        "entry). Record what was decided/observed and why.",
      inputSchema: {
        ...athleteIdShape,
        summary: z.string().min(1).describe("What was decided or observed (required)."),
        author: z.string().optional().describe('Who logged it (agent name or "thomas").'),
        trigger: z
          .enum(["missed_session", "low_readiness", "illness", "manual", "scheduled"])
          .optional()
          .describe("What prompted this entry."),
        detail: z.record(z.string(), z.unknown()).optional().describe("Structured extra context."),
        relatedWeek: z.string().optional().describe("The week this acted on, YYYY-MM-DD.")
      }
    },
    (args) =>
      runAthleteTool(store, args.athleteId, (scoped) => {
        const entry: AdaptationLogInput = { summary: args.summary };
        if (args.author !== undefined) entry.author = args.author;
        if (args.trigger !== undefined) entry.trigger = args.trigger;
        if (args.detail !== undefined) entry.detail = args.detail;
        if (args.relatedWeek !== undefined) entry.relatedWeek = args.relatedWeek;
        return scoped.logAdaptation(entry);
      })
  );
}
