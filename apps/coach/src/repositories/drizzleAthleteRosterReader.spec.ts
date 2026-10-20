import { describe, it, expect } from "vitest";
import { toAthleteRosterEntry, type AthleteRosterRow } from "./drizzleAthleteRosterReader";

const row: AthleteRosterRow = {
  id: "a-1",
  displayName: "Thomas",
  phoneNum: "+32470000000",
  whatsappLid: null,
  status: "active",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  planName: "Gran Fondo 2027",
  planStatus: "active",
  propositionWeekStart: "2026-10-12",
  propositionStatus: "applied",
  intervalsConnectedAt: new Date("2026-10-20T09:00:00Z")
};

describe("toAthleteRosterEntry", () => {
  it("maps the athlete with their plan and latest proposition", () => {
    expect(toAthleteRosterEntry(row)).toEqual({
      id: "a-1",
      displayName: "Thomas",
      phoneNum: "+32470000000",
      whatsappLid: null,
      status: "active",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      plan: { name: "Gran Fondo 2027", status: "active" },
      latestProposition: { weekStart: "2026-10-12", status: "applied" },
      intervals: { connectedAt: new Date("2026-10-20T09:00:00Z") }
    });
  });

  it("maps unmatched lateral joins to null", () => {
    const entry = toAthleteRosterEntry({
      ...row,
      planName: null,
      planStatus: null,
      propositionWeekStart: null,
      propositionStatus: null,
      intervalsConnectedAt: null
    });
    expect(entry.plan).toBeNull();
    expect(entry.latestProposition).toBeNull();
    expect(entry.intervals).toBeNull();
  });
});
