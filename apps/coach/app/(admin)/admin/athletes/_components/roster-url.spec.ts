import { describe, it, expect } from "vitest";
import type { AthleteRosterEntry } from "@/domain/athleteRoster";
import {
  DEFAULT_SORT,
  matchesSearch,
  matchesStatus,
  readSort,
  readStatus,
  writeSort
} from "./roster-url";

const row: AthleteRosterEntry = {
  id: "a-1",
  displayName: "Thomas",
  phoneNum: "+32470000000",
  whatsappLid: "123456@lid",
  status: "active",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  plan: null,
  latestProposition: null,
  intervals: null
};

describe("readSort / writeSort", () => {
  it.each([
    ["name", [{ id: "name", desc: false }]],
    ["-createdAt", [{ id: "createdAt", desc: true }]]
  ])("round-trips %s", (value, sorting) => {
    expect(readSort(value)).toEqual(sorting);
    expect(writeSort(sorting)).toBe(value);
  });

  it.each([null, "", "-", "unknown", "-phoneNum"])("falls back to the default for %s", (value) => {
    expect(readSort(value)).toEqual(DEFAULT_SORT);
  });

  it("drops the param when no sort is left", () => {
    expect(writeSort([])).toBeNull();
  });
});

describe("readStatus", () => {
  it.each(["onboarding", "active", "paused", "ended", "blocked"])("keeps %s", (value) => {
    expect(readStatus(value)).toBe(value);
  });

  it.each([null, "", "ACTIVE", "deleted", "attention"])("ignores %s", (value) => {
    expect(readStatus(value)).toBeNull();
  });
});

describe("matchesSearch", () => {
  it.each(["", "  ", "thom", "THOMAS", "+3247", "123456@"])("matches %j", (query) => {
    expect(matchesSearch(row, query)).toBe(true);
  });

  it("matches nothing else, and survives missing fields", () => {
    expect(matchesSearch({ ...row, displayName: null, whatsappLid: null }, "thom")).toBe(false);
  });
});

describe("matchesStatus", () => {
  it("keeps everyone without a filter", () => {
    expect(matchesStatus(row, null)).toBe(true);
  });

  it("filters on the lifecycle status", () => {
    expect(matchesStatus(row, "active")).toBe(true);
    expect(matchesStatus(row, "paused")).toBe(false);
  });
});
