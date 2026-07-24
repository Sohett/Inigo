import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { IntervalsIcuClient } from "./client";

// Mock only `getIntervalsKey` from @inigo/db so the resolver can be exercised without a DB.
// `vi.hoisted` gives the mock fn a stable identity the hoisted `vi.mock` factory can capture.
const { getIntervalsKey } = vi.hoisted(() => ({ getIntervalsKey: vi.fn() }));
vi.mock("@inigo/db", () => ({ getIntervalsKey }));

import { createIntervalsResolver } from "./resolveClient";

const MASTER_KEY = Buffer.alloc(32).toString("base64");
const BASE_URL = "https://intervals.icu/api/v1";
const ATHLETE = "550e8400-e29b-41d4-a716-446655440000";
const API_KEY = "super-secret-key";
const db = {} as Parameters<typeof createIntervalsResolver>[0];

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  getIntervalsKey.mockReset();
});
afterAll(() => server.close());

describe("createIntervalsResolver", () => {
  it("builds a client that calls Intervals with the resolved key + external athlete id", async () => {
    getIntervalsKey.mockResolvedValue({ apiKey: API_KEY, externalAthleteId: "i789" });
    let auth: string | null = null;
    server.use(
      http.get(`${BASE_URL}/athlete/i789/gear`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json([]);
      })
    );

    const resolve = createIntervalsResolver(db, MASTER_KEY, BASE_URL);
    const client = await resolve(ATHLETE);
    expect(client).toBeInstanceOf(IntervalsIcuClient);
    await client.getGear();

    // The resolved key reaches Intervals only as the HTTP Basic password, and the external
    // id keys the path — proving the resolver wires both credential fields correctly.
    expect(auth).toBe(`Basic ${Buffer.from(`API_KEY:${API_KEY}`).toString("base64")}`);
    expect(getIntervalsKey).toHaveBeenCalledWith(db, ATHLETE, MASTER_KEY);
  });

  it("throws a clear error when the athlete has no stored credential", async () => {
    getIntervalsKey.mockResolvedValue(null);
    const resolve = createIntervalsResolver(db, MASTER_KEY, BASE_URL);
    const error = (await resolve(ATHLETE).catch((e: unknown) => e)) as Error;
    expect(error.message).toContain("No Intervals.icu credential stored");
    expect(error.message).toContain(ATHLETE);
  });

  it("throws a secret-free error when the credential has no external athlete id", async () => {
    getIntervalsKey.mockResolvedValue({ apiKey: API_KEY, externalAthleteId: null });
    const resolve = createIntervalsResolver(db, MASTER_KEY, BASE_URL);
    const error = (await resolve(ATHLETE).catch((e: unknown) => e)) as Error;
    expect(error.message).toContain("missing the Intervals athlete id");
    // The decrypted key must never appear in an error surfaced to the caller.
    expect(error.message).not.toContain(API_KEY);
  });
});
