import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { IntervalsIcuClient } from "./client";

// Mock only `getIntervalsCredential` from @inigo/db so the resolver can be exercised without a DB.
// `vi.hoisted` gives the mock fn a stable identity the hoisted `vi.mock` factory can capture.
const { getIntervalsCredential } = vi.hoisted(() => ({ getIntervalsCredential: vi.fn() }));
vi.mock("@inigo/db", () => ({ getIntervalsCredential }));

import { createIntervalsResolver } from "./resolveClient";

const MASTER_KEY = Buffer.alloc(32).toString("base64");
const BASE_URL = "https://intervals.icu/api/v1";
const ATHLETE = "550e8400-e29b-41d4-a716-446655440000";
const TOKEN = "super-secret-token";
const db = {} as Parameters<typeof createIntervalsResolver>[0];

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  getIntervalsCredential.mockReset();
});
afterAll(() => server.close());

describe("createIntervalsResolver", () => {
  it("builds a client that calls Intervals with the resolved token as Bearer and the external athlete id", async () => {
    getIntervalsCredential.mockResolvedValue({ secret: TOKEN, externalAthleteId: "i789" });
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

    // The resolved token reaches Intervals only as the Bearer header, and the external id keys
    // the path: the resolver wires both credential fields.
    expect(auth).toBe(`Bearer ${TOKEN}`);
    expect(getIntervalsCredential).toHaveBeenCalledWith(db, ATHLETE, MASTER_KEY);
  });

  it("throws a clear error when the athlete has no stored credential", async () => {
    getIntervalsCredential.mockResolvedValue(null);
    const resolve = createIntervalsResolver(db, MASTER_KEY, BASE_URL);
    const error = (await resolve(ATHLETE).catch((e: unknown) => e)) as Error;
    expect(error.message).toContain("No Intervals.icu credential stored");
    expect(error.message).toContain(ATHLETE);
  });

  it("throws a secret-free error when the credential has no external athlete id", async () => {
    getIntervalsCredential.mockResolvedValue({ secret: TOKEN, externalAthleteId: null });
    const resolve = createIntervalsResolver(db, MASTER_KEY, BASE_URL);
    const error = (await resolve(ATHLETE).catch((e: unknown) => e)) as Error;
    expect(error.message).toContain("missing the Intervals athlete id");
    // The decrypted token must never appear in an error surfaced to the caller.
    expect(error.message).not.toContain(TOKEN);
  });
});
