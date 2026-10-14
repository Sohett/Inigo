import { describe, it, expect } from "vitest";
import type { AthleteRosterEntry } from "../domain/athleteRoster";
import { attentionOf, createListAdminAthletes } from "./listAdminAthletes";

const onTrack: AthleteRosterEntry = {
  id: "a-1",
  displayName: "Thomas",
  phoneNum: "+32470000000",
  whatsappLid: null,
  status: "active",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  plan: { name: "Gran Fondo 2027", status: "active" },
  latestProposition: { weekStart: "2026-10-12", status: "applied" }
};

describe("attentionOf", () => {
  it("leaves an active athlete with a running plan and an applied week alone", () => {
    expect(attentionOf(onTrack)).toBeNull();
  });

  it.each([
    ["no plan at all", null],
    ["a draft plan", { name: "Brouillon", status: "draft" as const }],
    ["a completed plan", { name: "Saison 2026", status: "completed" as const }]
  ])("flags an active athlete with %s", (_label, plan) => {
    expect(attentionOf({ ...onTrack, plan })).toBe("no_active_plan");
  });

  it.each(["draft", "validated"] as const)("flags an active athlete whose latest week is %s", (status) => {
    expect(
      attentionOf({ ...onTrack, latestProposition: { weekStart: "2026-10-19", status } })
    ).toBe("proposition_pending");
  });

  it.each(["applied", "rejected"] as const)("does not flag a latest week %s", (status) => {
    expect(attentionOf({ ...onTrack, latestProposition: { weekStart: "2026-10-19", status } })).toBeNull();
  });

  it("does not flag an active athlete with a plan but no proposition yet", () => {
    expect(attentionOf({ ...onTrack, latestProposition: null })).toBeNull();
  });

  it.each(["onboarding", "paused", "ended"] as const)(
    "expects no plan from a %s athlete",
    (status) => {
      expect(attentionOf({ ...onTrack, status, plan: null, latestProposition: null })).toBeNull();
    }
  );
});

describe("listAdminAthletes", () => {
  it("returns every athlete with what calls for a look, in the reader's order", async () => {
    const noPlan: AthleteRosterEntry = { ...onTrack, id: "a-2", plan: null };
    const rows = await createListAdminAthletes({
      roster: { listRoster: () => Promise.resolve([onTrack, noPlan]) }
    }).execute();

    expect(rows).toEqual([
      { ...onTrack, attention: null },
      { ...noPlan, attention: "no_active_plan" }
    ]);
  });
});
