import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { IntervalsIcuClient } from "./client";
import { IntervalsIcuApiError } from "./errors";

const BASE_URL = "https://intervals.icu/api/v1";
const ATHLETE = "i123456";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient(overrides: Partial<ConstructorParameters<typeof IntervalsIcuClient>[0]> = {}) {
  return new IntervalsIcuClient({
    apiKey: "secret-key",
    athleteId: ATHLETE,
    retryDelayMs: 0,
    ...overrides
  });
}

describe("IntervalsIcuClient", () => {
  it("sends HTTP Basic auth with the API_KEY username convention", async () => {
    let received: string | null = null;
    server.use(
      http.get(`${BASE_URL}/athlete/${ATHLETE}/activities`, ({ request }) => {
        received = request.headers.get("authorization");
        return HttpResponse.json([]);
      })
    );

    await makeClient().getActivities();

    const expected = `Basic ${Buffer.from("API_KEY:secret-key").toString("base64")}`;
    expect(received).toBe(expected);
  });

  it("forwards date range query parameters", async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${BASE_URL}/athlete/${ATHLETE}/activities`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([]);
      })
    );

    await makeClient().getActivities({ oldest: "2026-01-01", newest: "2026-01-31", limit: 10 });

    expect(url!.searchParams.get("oldest")).toBe("2026-01-01");
    expect(url!.searchParams.get("newest")).toBe("2026-01-31");
    expect(url!.searchParams.get("limit")).toBe("10");
  });

  it("parses and returns an activity", async () => {
    server.use(
      http.get(`${BASE_URL}/activity/abc`, () =>
        HttpResponse.json({ id: "abc", name: "Morning Run", type: "Run", distance: 10000 })
      )
    );

    const activity = await makeClient().getActivity("abc");
    expect(activity.name).toBe("Morning Run");
    expect(activity.distance).toBe(10000);
  });

  it("derives fitness (form = ctl - atl) from wellness records", async () => {
    server.use(
      http.get(`${BASE_URL}/athlete/${ATHLETE}/wellness`, () =>
        HttpResponse.json([
          { id: "2026-06-01", ctl: 50, atl: 40 },
          { id: "2026-06-02", ctl: 52 }
        ])
      )
    );

    const fitness = await makeClient().getFitness();
    expect(fitness[0]).toEqual({ date: "2026-06-01", ctl: 50, atl: 40, form: 10 });
    expect(fitness[1]).toEqual({ date: "2026-06-02", ctl: 52, atl: null, form: null });
  });

  it("throws a typed error with status on 404", async () => {
    server.use(
      http.get(`${BASE_URL}/activity/missing`, () =>
        HttpResponse.text("Not found", { status: 404 })
      )
    );

    await expect(makeClient().getActivity("missing")).rejects.toMatchObject({
      name: "IntervalsIcuApiError",
      status: 404
    });
  });

  it("retries retryable 5xx responses then throws", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE_URL}/athlete/${ATHLETE}/activities`, () => {
        calls += 1;
        return HttpResponse.text("boom", { status: 503 });
      })
    );

    await expect(makeClient({ maxRetries: 2 }).getActivities()).rejects.toBeInstanceOf(
      IntervalsIcuApiError
    );
    expect(calls).toBe(3); // initial attempt + 2 retries
  });

  it("creates an event via POST and updates via PUT", async () => {
    const methods: string[] = [];
    server.use(
      http.post(`${BASE_URL}/athlete/${ATHLETE}/events`, async ({ request }) => {
        methods.push(request.method);
        return HttpResponse.json({ id: 1, name: "Created" });
      }),
      http.put(`${BASE_URL}/athlete/${ATHLETE}/events/1`, async ({ request }) => {
        methods.push(request.method);
        return HttpResponse.json({ id: 1, name: "Updated" });
      })
    );

    const created = await makeClient().upsertEvent({ name: "Created", category: "WORKOUT" });
    expect(created.name).toBe("Created");
    const updated = await makeClient().upsertEvent({ name: "Updated" }, "1");
    expect(updated.name).toBe("Updated");
    expect(methods).toEqual(["POST", "PUT"]);
  });

  it("updates sport settings with a partial PUT of only the provided fields", async () => {
    let method = "";
    let putUrl: URL | null = null;
    let putBody: Record<string, unknown> | null = null;
    // Only a PUT handler is registered: onUnhandledRequest "error" makes the test fail if
    // the client also issues a GET, so this proves the write is a single partial PUT.
    server.use(
      http.put(`${BASE_URL}/athlete/${ATHLETE}/sport-settings/Ride`, async ({ request }) => {
        method = request.method;
        putUrl = new URL(request.url);
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 42, type: "Ride", ftp: 265 });
      })
    );

    const updated = await makeClient().updateSportSettings("Ride", { ftp: 265 });

    expect(method).toBe("PUT");
    // Required query flag is always false so provided values are never overridden.
    expect(putUrl!.searchParams.get("recalcHrZones")).toBe("false");
    // Only the provided field is sent (partial update, no clobbering of other settings).
    expect(putBody).toEqual({ ftp: 265 });
    expect(updated.ftp).toBe(265);
  });

  it("requests the plural power-curves endpoint with type and repeated curve params", async () => {
    let url: URL | null = null;
    server.use(
      http.get(`${BASE_URL}/athlete/${ATHLETE}/power-curves`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({});
      })
    );

    await makeClient().getPowerCurve({ type: "Ride", curves: ["5s", "1m"], newest: "2026-06-01" });

    expect(url!.pathname).toBe(`/api/v1/athlete/${ATHLETE}/power-curves`);
    expect(url!.searchParams.get("type")).toBe("Ride");
    expect(url!.searchParams.getAll("curves")).toEqual(["5s", "1m"]);
    expect(url!.searchParams.get("newest")).toBe("2026-06-01");
  });

  it("deletes events by range with a repeated required category array", async () => {
    let url: URL | null = null;
    let method = "";
    server.use(
      http.delete(`${BASE_URL}/athlete/${ATHLETE}/events`, ({ request }) => {
        url = new URL(request.url);
        method = request.method;
        return new HttpResponse(null, { status: 200 });
      })
    );

    await makeClient().deleteEventsByRange({
      oldest: "2026-01-01",
      newest: "2026-01-31",
      category: ["WORKOUT", "NOTE"]
    });

    expect(method).toBe("DELETE");
    expect(url!.searchParams.get("oldest")).toBe("2026-01-01");
    expect(url!.searchParams.getAll("category")).toEqual(["WORKOUT", "NOTE"]);
  });
});
