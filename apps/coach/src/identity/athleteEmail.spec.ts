import { describe, expect, it } from "vitest";
import { athleteEmail, athleteIdOf } from "./athleteEmail";

const ATHLETE_ID = "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f";

describe("athleteEmail", () => {
  it("round trips an athlete id", () => {
    expect(athleteIdOf(athleteEmail(ATHLETE_ID))).toBe(ATHLETE_ID);
  });

  it("reads any other email as a coach's", () => {
    expect(athleteIdOf("sohet.thomas@gmail.com")).toBeNull();
    expect(athleteIdOf(`${ATHLETE_ID}@gmail.com`)).toBeNull();
  });

  it("rejects a local part that is not an athlete id, or a second @", () => {
    expect(athleteIdOf("admin@athletes.inigo.invalid")).toBeNull();
    expect(athleteIdOf(`${ATHLETE_ID}@athletes.inigo.invalid@x`)).toBeNull();
  });
});
