import { describe, it, expect } from "vitest";
import { athlete } from "@inigo/db";
import { toAthlete } from "./drizzleAthleteRepository";

type AthleteRow = typeof athlete.$inferSelect;

function makeRow(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: "a-1",
    displayName: "Thomas",
    phoneNum: "+32475123456",
    chatId: "32475123456@c.us",
    timezone: "Europe/Brussels",
    locale: "fr",
    status: "active",
    anthropicSessionId: "sesn_abc",
    managedAgentId: "agent_abc",
    memoryStoreId: "memstore_abc",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides
  };
}

describe("toAthlete", () => {
  it("maps a full row onto the routing slice of the domain model", () => {
    expect(toAthlete(makeRow())).toEqual({
      id: "a-1",
      displayName: "Thomas",
      phoneNum: "+32475123456",
      chatId: "32475123456@c.us",
      status: "active",
      anthropicSessionId: "sesn_abc",
      managedAgentId: "agent_abc"
    });
  });

  it("preserves nulls (no session / no chat id yet)", () => {
    const mapped = toAthlete(makeRow({ chatId: null, anthropicSessionId: null, managedAgentId: null }));
    expect(mapped.chatId).toBeNull();
    expect(mapped.anthropicSessionId).toBeNull();
    expect(mapped.managedAgentId).toBeNull();
  });

  it("does not leak DB-only columns (timezone, timestamps, memoryStoreId)", () => {
    expect(Object.keys(toAthlete(makeRow())).sort()).toEqual(
      ["anthropicSessionId", "chatId", "displayName", "id", "managedAgentId", "phoneNum", "status"].sort()
    );
  });
});
