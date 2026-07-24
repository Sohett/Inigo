import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { athleteIdShape, dateRangeShape, runAthleteTool, type ResolveClient } from "../result";

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Intervals.icu rejects a bare `YYYY-MM-DD` `start_date_local` with HTTP 422; it wants a full
 * local datetime. Pad a date-only value to midnight so callers can pass either form.
 */
function normalizeStartDateLocal(value: string): string {
  return dateOnly.test(value) ? `${value}T00:00:00` : value;
}

export function registerEventReadTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "get_events",
    {
      title: "List events",
      description:
        "List calendar events (planned workouts, races, notes) over a date range, optionally filtered by category.",
      inputSchema: {
        ...athleteIdShape,
        ...dateRangeShape,
        category: z
          .array(z.string())
          .optional()
          .describe('Filter to these categories, e.g. ["WORKOUT", "RACE_A"].')
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, (client) =>
        client.getEvents({ oldest: args.oldest, newest: args.newest, category: args.category })
      )
  );

  server.registerTool(
    "get_event",
    {
      title: "Get event",
      description: "Get a single calendar event by its id.",
      inputSchema: {
        ...athleteIdShape,
        eventId: z.string().describe("Event id.")
      }
    },
    (args) => runAthleteTool(resolve, args.athleteId, (client) => client.getEvent(args.eventId))
  );
}

export function registerEventWriteTools(server: McpServer, resolve: ResolveClient): void {
  server.registerTool(
    "create_or_update_event",
    {
      title: "Create or update event",
      description:
        "Create a calendar event (planned workout, race, note). Provide an eventId to update an existing event instead of creating a new one.",
      inputSchema: {
        ...athleteIdShape,
        eventId: z.string().optional().describe("Provide to update an existing event; omit to create."),
        startDateLocal: z
          .string()
          .describe(
            "Local start date or datetime. A bare YYYY-MM-DD is normalized to midnight (Intervals.icu requires a full datetime)."
          ),
        category: z
          .string()
          .describe("Event category, e.g. WORKOUT, RACE_A, RACE_B, NOTE, HOLIDAY."),
        name: z.string().describe("Event name/title."),
        type: z.string().optional().describe("Sport/type, e.g. Run, Ride, Swim."),
        description: z.string().optional().describe("Optional free-text description or workout steps.")
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, (client) => {
        const event: Record<string, unknown> = {
          start_date_local: normalizeStartDateLocal(args.startDateLocal),
          category: args.category,
          name: args.name
        };
        if (args.type !== undefined) event["type"] = args.type;
        if (args.description !== undefined) event["description"] = args.description;
        return client.upsertEvent(event, args.eventId);
      })
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete event",
      description: "Delete a single calendar event by its id.",
      inputSchema: {
        ...athleteIdShape,
        eventId: z.string().describe("Event id to delete.")
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) => {
        await client.deleteEvent(args.eventId);
        return { deleted: args.eventId };
      })
  );

  server.registerTool(
    "delete_events_by_range",
    {
      title: "Delete events by date range",
      description:
        "Delete calendar events within a date range, restricted to the given categories. Use with care.",
      inputSchema: {
        ...athleteIdShape,
        oldest: z.string().describe("Inclusive start date (YYYY-MM-DD)."),
        newest: z.string().optional().describe("Inclusive end date (YYYY-MM-DD)."),
        category: z
          .array(z.string())
          .min(1)
          .describe('Categories to delete (required), e.g. ["WORKOUT"]. Guards against wiping the whole calendar.')
      }
    },
    (args) =>
      runAthleteTool(resolve, args.athleteId, async (client) => {
        await client.deleteEventsByRange({
          oldest: args.oldest,
          newest: args.newest,
          category: args.category
        });
        return { deleted: { oldest: args.oldest, newest: args.newest ?? null, category: args.category } };
      })
  );
}
