import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createIntervalsCredentialVerifier } from "./credentialVerifier";

const BASE_URL = "https://intervals.icu/api/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function answer(status: number, body: Record<string, unknown> = {}) {
  server.use(http.get(`${BASE_URL}/athlete/i42`, () => HttpResponse.json(body, { status })));
}

describe("createIntervalsCredentialVerifier", () => {
  it("reads the athlete with the key to prove the pair", async () => {
    let authorization: string | null = null;
    server.use(
      http.get(`${BASE_URL}/athlete/i42`, ({ request }) => {
        authorization = request.headers.get("authorization");
        return HttpResponse.json({ id: "i42", name: "Thomas" });
      })
    );
    const check = await createIntervalsCredentialVerifier(BASE_URL).check("the-key", "i42");

    expect(check).toEqual({ status: "valid", athleteName: "Thomas" });
    expect(authorization).toBe(`Basic ${Buffer.from("API_KEY:the-key").toString("base64")}`);
  });

  it.each([
    [401, "invalid_credentials"],
    [403, "invalid_credentials"],
    [404, "unknown_athlete_id"]
  ] as const)("reads a %s as %s", async (status, expected) => {
    answer(status);
    expect(await createIntervalsCredentialVerifier(BASE_URL).check("the-key", "i42")).toEqual({
      status: expected
    });
  });

  it("throws on an outage, never stores a guess", async () => {
    answer(500);
    await expect(createIntervalsCredentialVerifier(BASE_URL).check("the-key", "i42")).rejects.toThrow();
  });
});
