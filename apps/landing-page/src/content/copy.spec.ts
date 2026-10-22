import { describe, expect, it } from "vitest";
import * as copy from "@/content/copy";
import { disciplines, goals, scenarios } from "@/content/demo";
import { planDemo } from "@/lib/plan-demo";

/** Valeurs qui ne s'affichent pas : identifiants, adresse du lien mailto. */
const HIDDEN_KEYS = new Set(["id", "contactEmail"]);

/** Tous les textes visibles d'une valeur de copy (les ancres `#…` ne s'affichent pas). */
function texts(value: unknown): string[] {
  if (typeof value === "string") return value.startsWith("#") ? [] : [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => (HIDDEN_KEYS.has(key) ? [] : texts(child)));
  }
  return [];
}

const DASH = /[-—–]/;

describe("visible copy", () => {
  it("contains no dash in the static copy", () => {
    expect(texts(copy).filter((text) => DASH.test(text))).toEqual([]);
  });

  it("contains no dash in the demo content", () => {
    expect(texts({ disciplines, goals, scenarios }).filter((text) => DASH.test(text))).toEqual([]);
  });

  it("contains no dash in any message the demo can show", () => {
    const messages = goals.flatMap((goal) =>
      scenarios.map((scenario) => scenario.id).flatMap((scenarioId) =>
        texts(planDemo(goal.id, scenarioId).messages),
      ),
    );
    expect(messages.filter((text) => DASH.test(text))).toEqual([]);
  });
});
