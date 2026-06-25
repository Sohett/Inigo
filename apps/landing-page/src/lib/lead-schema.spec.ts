import { describe, it, expect } from "vitest";

import { leadSchema } from "./lead-schema";

describe("leadSchema", () => {
  it("accepte un payload minimal valide", () => {
    const result = leadSchema.safeParse({ phone: "+32470123456", consent: true });
    expect(result.success).toBe(true);
  });

  it("accepte et trim le prénom", () => {
    const result = leadSchema.safeParse({
      firstName: "  Léa  ",
      phone: "+32470123456",
      consent: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Léa");
    }
  });

  it("rejette un consentement manquant ou faux", () => {
    expect(leadSchema.safeParse({ phone: "x", consent: false }).success).toBe(false);
    expect(leadSchema.safeParse({ phone: "x" }).success).toBe(false);
  });

  it("rejette un prénom de plus de 60 caractères", () => {
    const result = leadSchema.safeParse({
      firstName: "a".repeat(61),
      phone: "x",
      consent: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejette un numéro vide", () => {
    expect(leadSchema.safeParse({ phone: "", consent: true }).success).toBe(false);
  });
});
