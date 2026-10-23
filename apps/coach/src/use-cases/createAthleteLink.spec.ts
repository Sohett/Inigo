import { describe, expect, it, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import { AthleteLinkDestination, createCreateAthleteLink, type AthleteLinkIssuer } from "./createAthleteLink";

const ATHLETE = { id: "550e8400-e29b-41d4-a716-446655440000", displayName: "Thomas" } as Athlete;
const EXPIRES_AT = new Date("2026-10-15T11:00:00Z");

function setup(overrides: { issuer?: null; intervalsOAuthConfigured?: boolean } = {}) {
  const issue = vi.fn<AthleteLinkIssuer["issue"]>(async () => ({ url: "https://app.inigo-coach.com/api/auth/magic-link/verify?token=t", expiresAt: EXPIRES_AT }));
  const useCase = createCreateAthleteLink({
    issuer: overrides.issuer === null ? null : { issue },
    intervalsOAuthConfigured: overrides.intervalsOAuthConfigured ?? true,
    repo: { findById: vi.fn(async (id: string) => (id === ATHLETE.id ? ATHLETE : null)) }
  });
  return { useCase, issue };
}

describe("createAthleteLink", () => {
  it("issues a sign in link for the athlete that lands on the connection page", async () => {
    const { useCase, issue } = setup();
    const outcome = await useCase.execute(ATHLETE.id, AthleteLinkDestination.IntervalsConnect);

    expect(issue).toHaveBeenCalledWith(ATHLETE, "/connect/intervals");
    expect(outcome).toEqual({
      status: "link",
      url: "https://app.inigo-coach.com/api/auth/magic-link/verify?token=t",
      expiresAt: "2026-10-15T11:00:00.000Z"
    });
  });

  it("says the connection is unavailable when the Intervals.icu OAuth app is not configured", async () => {
    const { useCase, issue } = setup({ intervalsOAuthConfigured: false });
    expect((await useCase.execute(ATHLETE.id, AthleteLinkDestination.IntervalsConnect)).status).toBe("unavailable");
    expect(issue).not.toHaveBeenCalled();
  });

  it("says links are unavailable when sign in is not configured", async () => {
    const { useCase } = setup({ issuer: null });
    expect((await useCase.execute(ATHLETE.id, AthleteLinkDestination.IntervalsConnect)).status).toBe("unavailable");
  });

  it("refuses an athlete that does not exist, issuing nothing", async () => {
    const { useCase, issue } = setup();
    const outcome = await useCase.execute("11111111-1111-4111-8111-111111111111", AthleteLinkDestination.IntervalsConnect);
    expect(outcome.status).toBe("unknown_athlete");
    expect(issue).not.toHaveBeenCalled();
  });
});
