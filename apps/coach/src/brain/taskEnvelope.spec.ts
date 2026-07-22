import { describe, it, expect } from "vitest";
import { formatTurn, formatDateDuJour } from "./taskEnvelope";

// In Europe/Brussels (the default timezone) this instant is Thursday 2026-07-09.
const FIXED_NOW = new Date("2026-07-09T09:05:56Z");

describe("formatDateDuJour", () => {
  it("renders YYYY-MM-DD with the French weekday in the given timezone", () => {
    expect(formatDateDuJour(FIXED_NOW, "Europe/Brussels")).toBe("2026-07-09 (jeudi)");
  });

  it("rolls the day at the athlete's local midnight, not UTC's", () => {
    // Same instant, two timezones: it is already the 10th in Auckland but still the 9th in LA.
    const instant = new Date("2026-07-09T22:30:00Z");
    expect(formatDateDuJour(instant, "Pacific/Auckland")).toBe("2026-07-10 (vendredi)");
    expect(formatDateDuJour(instant, "America/Los_Angeles")).toBe("2026-07-09 (jeudi)");
  });

  it("defaults to Europe/Brussels when no timezone is given", () => {
    // 23:30 UTC is already past midnight in Brussels (UTC+2 in summer).
    expect(formatDateDuJour(new Date("2026-07-09T23:30:00Z"))).toBe("2026-07-10 (vendredi)");
  });
});

describe("formatTurn", () => {
  it("prepends date_du_jour ahead of the athlete id, chat id and message", () => {
    expect(formatTurn("a-1", "32475123456@c.us", "salut", FIXED_NOW, "Europe/Brussels")).toBe(
      "date_du_jour: 2026-07-09 (jeudi)\ninigo_athlete_id: a-1\nchat_id: 32475123456@c.us\nmessage: salut"
    );
  });
});
