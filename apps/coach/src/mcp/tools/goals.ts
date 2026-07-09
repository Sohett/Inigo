import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GoalInput, ScopedAthleteDataStore } from "../store/athleteDataStore";
import { runTool } from "./result";

export function registerGoalReadTools(server: McpServer, store: ScopedAthleteDataStore): void {
  server.registerTool(
    "get_goals",
    {
      title: "Get athlete goals",
      description:
        "Read the athlete's structured goals (season targets, races, performance/health goals), " +
        "filtered by status (default active), soonest target date first.",
      inputSchema: {
        status: z
          .enum(["active", "achieved", "abandoned"])
          .optional()
          .describe("Filter by status. Defaults to active.")
      }
    },
    (args) => runTool(() => store.getGoals(args.status))
  );
}

export function registerGoalWriteTools(server: McpServer, store: ScopedAthleteDataStore): void {
  server.registerTool(
    "upsert_goal",
    {
      title: "Create or update an athlete goal",
      description:
        "Create a goal (omit `id`) or update an existing one (pass its `id`). `title` is required " +
        "when creating. A goal can link to an Intervals.icu event via `intervalsEventId` without " +
        "duplicating the calendar entry.",
      inputSchema: {
        id: z.string().uuid().optional().describe("Goal id to update; omit to create a new goal."),
        title: z.string().min(1).optional().describe("Goal title (required when creating)."),
        description: z.string().optional(),
        type: z.enum(["event", "performance", "health"]).optional(),
        targetDate: z.string().optional().describe("Target date, YYYY-MM-DD."),
        priority: z.enum(["A", "B", "C"]).optional(),
        status: z.enum(["active", "achieved", "abandoned"]).optional(),
        intervalsEventId: z.string().optional().describe("Linked Intervals.icu event id, if any.")
      }
    },
    (args) =>
      runTool(async () => {
        const input: GoalInput = {};
        if (args.id !== undefined) input.id = args.id;
        if (args.title !== undefined) input.title = args.title;
        if (args.description !== undefined) input.description = args.description;
        if (args.type !== undefined) input.type = args.type;
        if (args.targetDate !== undefined) input.targetDate = args.targetDate;
        if (args.priority !== undefined) input.priority = args.priority;
        if (args.status !== undefined) input.status = args.status;
        if (args.intervalsEventId !== undefined) input.intervalsEventId = args.intervalsEventId;

        if (!input.id && !input.title) {
          throw new Error("upsert_goal requires a title when creating a new goal.");
        }
        if (input.id && Object.keys(input).filter((key) => key !== "id").length === 0) {
          throw new Error("upsert_goal with an id requires at least one field to update.");
        }
        const result = await store.upsertGoal(input);
        if (input.id && result === null) {
          throw new Error(`Goal ${input.id} not found for this athlete.`);
        }
        return result;
      })
  );
}
