import type { z } from "zod";
import { IntervalsIcuApiError } from "./errors";
import {
  activityListSchema,
  activitySchema,
  athleteSchema,
  curveSchema,
  eventListSchema,
  eventSchema,
  gearListSchema,
  intervalsSchema,
  streamListSchema,
  wellnessListSchema,
  type FitnessPoint,
  type IntervalsEvent
} from "./schemas";

export interface IntervalsIcuClientOptions {
  /** Intervals.icu API key (used as the HTTP Basic password). */
  apiKey: string;
  /** Athlete id, e.g. "i123456". */
  athleteId: string;
  /** Defaults to https://intervals.icu/api/v1 */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 15000. */
  timeoutMs?: number;
  /** Max retries for transient failures (network, 429, 5xx). Default 2. */
  maxRetries?: number;
  /** Base backoff delay between retries in ms. Default 250. */
  retryDelayMs?: number;
  /** Injectable fetch, primarily for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface DateRange {
  /** Inclusive start date, ISO format YYYY-MM-DD. */
  oldest?: string;
  /** Inclusive end date, ISO format YYYY-MM-DD. */
  newest?: string;
}

export interface CurveQuery {
  /** Sport, e.g. "Ride", "Run", "Swim", "TrailRun". Required by the API. */
  type: string;
  /** End date (YYYY-MM-DD). Defaults server-side to now. */
  newest?: string;
  /** Durations to return, e.g. ["5s", "1m", "5m", "20m"]. Defaults to last year. */
  curves?: string[];
}

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | QueryPrimitive[] | undefined;

const DEFAULT_BASE_URL = "https://intervals.icu/api/v1";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Thin, typed client over the Intervals.icu REST API.
 *
 * Authentication is HTTP Basic with the literal username `API_KEY` and the
 * account API key as the password, per the Intervals.icu API conventions.
 */
export class IntervalsIcuClient {
  private readonly athleteId: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly authHeader: string;

  constructor(options: IntervalsIcuClientOptions) {
    this.athleteId = options.athleteId;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.authHeader = `Basic ${Buffer.from(`API_KEY:${options.apiKey}`).toString("base64")}`;
  }

  // ----- Athlete -----

  getAthleteProfile(): Promise<z.infer<typeof athleteSchema>> {
    return this.requestJson(`/athlete/${this.athleteId}`, athleteSchema);
  }

  getGear(): Promise<z.infer<typeof gearListSchema>> {
    return this.requestJson(`/athlete/${this.athleteId}/gear`, gearListSchema);
  }

  // ----- Activities -----

  getActivities(
    range: DateRange & { limit?: number } = {}
  ): Promise<z.infer<typeof activityListSchema>> {
    return this.requestJson(`/athlete/${this.athleteId}/activities`, activityListSchema, {
      query: { oldest: range.oldest, newest: range.newest, limit: range.limit }
    });
  }

  getActivity(activityId: string): Promise<z.infer<typeof activitySchema>> {
    return this.requestJson(`/activity/${activityId}`, activitySchema);
  }

  getActivityIntervals(activityId: string): Promise<z.infer<typeof intervalsSchema>> {
    return this.requestJson(`/activity/${activityId}/intervals`, intervalsSchema);
  }

  getActivityStreams(
    activityId: string,
    types?: string[]
  ): Promise<z.infer<typeof streamListSchema>> {
    return this.requestJson(`/activity/${activityId}/streams`, streamListSchema, {
      query: { types }
    });
  }

  // ----- Wellness & fitness -----

  getWellness(range: DateRange = {}): Promise<z.infer<typeof wellnessListSchema>> {
    return this.requestJson(`/athlete/${this.athleteId}/wellness`, wellnessListSchema, {
      query: { oldest: range.oldest, newest: range.newest }
    });
  }

  /** CTL/ATL/TSB series derived from wellness records (form = ctl - atl). */
  async getFitness(range: DateRange = {}): Promise<FitnessPoint[]> {
    const wellness = await this.getWellness(range);
    return wellness.map((record) => {
      const ctl = record.ctl ?? null;
      const atl = record.atl ?? null;
      const form = ctl !== null && atl !== null ? ctl - atl : null;
      return { date: record.id ?? "", ctl, atl, form };
    });
  }

  // ----- Best-effort curves (athlete aggregate). `type` (sport) is required. -----

  getPowerCurve(query: CurveQuery): Promise<unknown> {
    return this.requestJson(`/athlete/${this.athleteId}/power-curves`, curveSchema, {
      query: { type: query.type, newest: query.newest, curves: query.curves }
    });
  }

  getHrCurve(query: CurveQuery): Promise<unknown> {
    return this.requestJson(`/athlete/${this.athleteId}/hr-curves`, curveSchema, {
      query: { type: query.type, newest: query.newest, curves: query.curves }
    });
  }

  getPaceCurve(query: CurveQuery): Promise<unknown> {
    return this.requestJson(`/athlete/${this.athleteId}/pace-curves`, curveSchema, {
      query: { type: query.type, newest: query.newest, curves: query.curves }
    });
  }

  // ----- Events -----

  getEvents(
    range: DateRange & { category?: string[] } = {}
  ): Promise<z.infer<typeof eventListSchema>> {
    return this.requestJson(`/athlete/${this.athleteId}/events`, eventListSchema, {
      query: { oldest: range.oldest, newest: range.newest, category: range.category }
    });
  }

  getEvent(eventId: string): Promise<z.infer<typeof eventSchema>> {
    return this.requestJson(`/athlete/${this.athleteId}/events/${eventId}`, eventSchema);
  }

  /** Create a new event, or update an existing one when `eventId` is provided. */
  upsertEvent(
    event: Record<string, unknown>,
    eventId?: string
  ): Promise<z.infer<typeof eventSchema>> {
    if (eventId !== undefined) {
      return this.requestJson(`/athlete/${this.athleteId}/events/${eventId}`, eventSchema, {
        method: "PUT",
        body: event
      });
    }
    return this.requestJson(`/athlete/${this.athleteId}/events`, eventSchema, {
      method: "POST",
      body: event
    });
  }

  deleteEvent(eventId: string): Promise<void> {
    return this.requestVoid(`/athlete/${this.athleteId}/events/${eventId}`, { method: "DELETE" });
  }

  /** `oldest` and `category` are required by the API (category prevents wiping the whole calendar). */
  deleteEventsByRange(range: {
    oldest: string;
    newest?: string;
    category: string[];
  }): Promise<void> {
    return this.requestVoid(`/athlete/${this.athleteId}/events`, {
      method: "DELETE",
      query: { oldest: range.oldest, newest: range.newest, category: range.category }
    });
  }

  // ----- Internals -----

  private async requestJson<T>(
    path: string,
    schema: z.ZodType<T>,
    options: { method?: string; query?: Record<string, QueryValue>; body?: unknown } = {}
  ): Promise<T> {
    const response = await this.send(path, options);
    const text = await response.text();
    let json: unknown;
    try {
      json = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      throw new IntervalsIcuApiError("Response was not valid JSON", {
        status: response.status,
        endpoint: path
      });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new IntervalsIcuApiError("Response did not match expected schema", {
        status: response.status,
        endpoint: path,
        body: parsed.error.issues
      });
    }
    return parsed.data;
  }

  private async requestVoid(
    path: string,
    options: { method?: string; query?: Record<string, QueryValue>; body?: unknown }
  ): Promise<void> {
    await this.send(path, options);
  }

  private async send(
    path: string,
    options: { method?: string; query?: Record<string, QueryValue>; body?: unknown }
  ): Promise<Response> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json"
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method: options.method ?? "GET",
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal
        });

        if (response.ok) return response;

        if (RETRYABLE_STATUS.has(response.status) && attempt < this.maxRetries) {
          lastError = await this.toApiError(response, path);
          await this.delay(attempt);
          continue;
        }
        throw await this.toApiError(response, path);
      } catch (error) {
        if (error instanceof IntervalsIcuApiError) throw error;
        lastError = error;
        if (attempt < this.maxRetries) {
          await this.delay(attempt);
          continue;
        }
        throw new IntervalsIcuApiError(
          `Request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
          { status: 0, endpoint: path }
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new IntervalsIcuApiError(`Request to ${path} failed after retries`, {
      status: 0,
      endpoint: path,
      body: lastError instanceof Error ? lastError.message : lastError
    });
  }

  private async toApiError(response: Response, path: string): Promise<IntervalsIcuApiError> {
    const body = await response.text().catch(() => undefined);
    return new IntervalsIcuApiError(`Intervals.icu API returned ${response.status}`, {
      status: response.status,
      endpoint: path,
      body
    });
  }

  private delay(attempt: number): Promise<void> {
    const ms = this.retryDelayMs * 2 ** attempt;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export type { IntervalsEvent, FitnessPoint };
