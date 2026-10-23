import { describe, expect, it, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import type { AthleteAccountRepository } from "../repositories/athleteAccountRepository";
import { AthleteLinkDestination, createCreateAthleteLink, type SignInLinkIssuer } from "./createAthleteLink";

const ATHLETE = { id: "550e8400-e29b-41d4-a716-446655440000", displayName: "Thomas" } as Athlete;
const EXPIRES_AT = new Date("2026-10-15T11:00:00Z");
const URL_ = "https://app.inigo-coach.com/api/auth/magic-link/verify?token=t";

function setup(overrides: { signIn?: null; intervalsOAuthConfigured?: boolean } = {}) {
  const calls: string[] = [];
  const findById = vi.fn(async (id: string) => {
    calls.push("findById");
    return id === ATHLETE.id ? ATHLETE : null;
  });
  const ensure = vi.fn<AthleteAccountRepository["ensure"]>(async () => {
    calls.push("ensure");
  });
  const issue = vi.fn<SignInLinkIssuer["issue"]>(async () => {
    calls.push("issue");
    return { url: URL_, expiresAt: EXPIRES_AT };
  });
  const useCase = createCreateAthleteLink({
    issuer: overrides.signIn === null ? null : { issue },
    accounts: overrides.signIn === null ? null : { ensure },
    intervalsOAuthConfigured: overrides.intervalsOAuthConfigured ?? true,
    repo: { findById }
  });
  return { useCase, ensure, issue, calls };
}

describe("createAthleteLink", () => {
  it("finds the athlete, makes sure they have a user, then issues the link to the connection page", async () => {
    const { useCase, ensure, issue, calls } = setup();
    const outcome = await useCase.execute(ATHLETE.id, AthleteLinkDestination.IntervalsConnect);

    expect(calls).toEqual(["findById", "ensure", "issue"]);
    expect(ensure).toHaveBeenCalledWith(ATHLETE);
    expect(issue).toHaveBeenCalledWith(ATHLETE.id, "/connect/intervals");
    expect(outcome).toEqual({ status: "link", url: URL_, expiresAt: "2026-10-15T11:00:00.000Z" });
  });

  it("says the connection is unavailable when the Intervals.icu OAuth app is not configured", async () => {
    const { useCase, calls } = setup({ intervalsOAuthConfigured: false });
    expect((await useCase.execute(ATHLETE.id, AthleteLinkDestination.IntervalsConnect)).status).toBe("unavailable");
    expect(calls).toEqual([]);
  });

  it("says links are unavailable when sign in is not configured", async () => {
    const { useCase } = setup({ signIn: null });
    expect((await useCase.execute(ATHLETE.id, AthleteLinkDestination.IntervalsConnect)).status).toBe("unavailable");
  });

  it("refuses an athlete that does not exist, creating no user and issuing nothing", async () => {
    const { useCase, calls } = setup();
    const outcome = await useCase.execute("11111111-1111-4111-8111-111111111111", AthleteLinkDestination.IntervalsConnect);
    expect(outcome.status).toBe("unknown_athlete");
    expect(calls).toEqual(["findById"]);
  });
});
