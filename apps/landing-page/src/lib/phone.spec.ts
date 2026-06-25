import { describe, it, expect } from "vitest";

import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("normalise un numéro BE local en E.164 (pays par défaut)", () => {
    expect(normalizePhone("0470 12 34 56")).toBe("+32470123456");
  });

  it("accepte un numéro international (France)", () => {
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("respecte un pays par défaut explicite", () => {
    expect(normalizePhone("06 12 34 56 78", "FR")).toBe("+33612345678");
  });

  it("rejette les entrées invalides", () => {
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone("pas un numéro")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});
