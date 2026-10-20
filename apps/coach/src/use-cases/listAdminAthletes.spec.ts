import { describe, it, expect } from "vitest";
import type { AthleteRosterEntry } from "../domain/athleteRoster";
import { createListAdminAthletes } from "./listAdminAthletes";

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

describe("listAdminAthletes", () => {
  it("returns every athlete, in the reader's order", async () => {
    const noPlan: AthleteRosterEntry = { ...onTrack, id: "a-2", plan: null };
    const rows = await createListAdminAthletes({
      roster: { listRoster: () => Promise.resolve([onTrack, noPlan]) }
    }).execute();

    expect(rows).toEqual([onTrack, noPlan]);
  });
});
