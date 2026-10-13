import { describe, it, expect } from "vitest";
import type { athlete, athleteSession } from "@inigo/db";
import { isUniqueViolation, toAthlete, toAthleteSession } from "./drizzleAthleteRepository";

type AthleteRow = typeof athlete.$inferSelect;
type AthleteSessionRow = typeof athleteSession.$inferSelect;

function makeRow(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: "a-1",
    displayName: "Thomas",
    phoneNum: "+32475123456",
    whatsappLid: "10325252415590@lid",
    chatId: "32475123456@c.us",
    timezone: "Europe/Brussels",
    locale: "fr",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides
  };
}

function makeSessionRow(overrides: Partial<AthleteSessionRow> = {}): AthleteSessionRow {
  return {
    id: "s-1",
    athleteId: "a-1",
    anthropicSessionId: "sesn_abc",
    managedAgentId: "agent_abc",
    endedAt: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-01T00:00:00Z"),
    ...overrides
  };
}

describe("toAthlete", () => {
  it("maps a row and its live session onto the routing slice of the domain model", () => {
    expect(toAthlete(makeRow(), makeSessionRow())).toEqual({
      id: "a-1",
      displayName: "Thomas",
      phoneNum: "+32475123456",
      whatsappLid: "10325252415590@lid",
      chatId: "32475123456@c.us",
      status: "active",
      timezone: "Europe/Brussels",
      locale: "fr",
      activeSession: { sessionId: "sesn_abc", agentId: "agent_abc" }
    });
  });

  it("falls back to French for a row without a locale", () => {
    expect(toAthlete(makeRow({ locale: null }), null).locale).toBe("fr");
  });

  it("maps an athlete without a live session to a null active session", () => {
    const mapped = toAthlete(makeRow({ chatId: null }), null);
    expect(mapped.chatId).toBeNull();
    expect(mapped.activeSession).toBeNull();
  });

  it("does not leak DB-only columns (timestamps)", () => {
    expect(Object.keys(toAthlete(makeRow(), makeSessionRow())).sort()).toEqual(
      [
        "activeSession",
        "chatId",
        "displayName",
        "id",
        "locale",
        "phoneNum",
        "status",
        "timezone",
        "whatsappLid"
      ].sort()
    );
  });
});

describe("toAthleteSession", () => {
  it("maps a live session, starting when it was recorded", () => {
    expect(toAthleteSession(makeSessionRow())).toEqual({
      sessionId: "sesn_abc",
      agentId: "agent_abc",
      startedAt: new Date("2026-02-01T00:00:00Z"),
      endedAt: null
    });
  });

  it("keeps the end date of a replaced session", () => {
    const endedAt = new Date("2026-03-01T00:00:00Z");
    expect(toAthleteSession(makeSessionRow({ endedAt })).endedAt).toEqual(endedAt);
  });
});

describe("isUniqueViolation", () => {
  it("recognises the Postgres code on the driver error or on Drizzle's wrapper", () => {
    expect(isUniqueViolation(Object.assign(new Error("dup"), { code: "23505" }))).toBe(true);
    expect(isUniqueViolation(new Error("wrapped", { cause: { code: "23505" } }))).toBe(true);
  });

  it("lets every other failure through", () => {
    expect(isUniqueViolation(new Error("fetch failed"))).toBe(false);
    expect(isUniqueViolation(new Error("check", { cause: { code: "23514" } }))).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
