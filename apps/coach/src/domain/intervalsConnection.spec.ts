import { describe, expect, it } from "vitest";
import { ConnectionResult, missingScopes, parseConnectionResult } from "./intervalsConnection";

describe("missingScopes", () => {
  it("is empty when every scope was granted", () => {
    expect(missingScopes(["ACTIVITY:READ", "WELLNESS:READ", "CALENDAR:WRITE", "SETTINGS:WRITE"])).toEqual([]);
  });

  it("counts a WRITE grant as covering the READ asked", () => {
    expect(missingScopes(["ACTIVITY:WRITE", "WELLNESS:WRITE", "CALENDAR:WRITE", "SETTINGS:WRITE"])).toEqual([]);
  });

  it("names what the athlete unticked, and never accepts a READ for a WRITE", () => {
    expect(missingScopes(["ACTIVITY:READ", "CALENDAR:READ", "settings:write "])).toEqual(["WELLNESS:READ", "CALENDAR:WRITE"]);
  });
});

describe("parseConnectionResult", () => {
  it("reads a known result and turns anything else into a failure", () => {
    expect(parseConnectionResult("connected")).toBe(ConnectionResult.Connected);
    expect(parseConnectionResult("<script>")).toBe(ConnectionResult.Failed);
    expect(parseConnectionResult(undefined)).toBe(ConnectionResult.Failed);
  });
});
