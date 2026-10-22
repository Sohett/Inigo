import { describe, expect, it } from "vitest";
import { goals, scenarios, type GoalId, type ScenarioId } from "@/content/demo";
import { planDemo } from "@/lib/plan-demo";

const allGoals = goals.map((goal) => goal.id);
const allScenarios = scenarios.map((scenario) => scenario.id);

describe("planDemo without a scenario", () => {
  const demo = planDemo("triathlon-l", null);

  it("shows the week as planned, with nothing adjusted", () => {
    expect(demo.days).toHaveLength(7);
    expect(demo.adjustedDays).toBe(0);
    expect(demo.weeks.find((week) => week.state === "current")?.label).toBe("ICI");
    expect(demo.messages).toHaveLength(1);
  });

  it("lists the three key sessions in the Monday message", () => {
    expect(demo.messages[0]?.attachments?.items.map((item) => item.text)).toEqual([
      "MAR · SWEET SPOT · Z3",
      "JEU · SEUIL · Z4",
      "SAM · SORTIE LONGUE · Z2",
    ]);
  });
});

describe.each(allGoals)("planDemo for %s", (goalId: GoalId) => {
  const demo = planDemo(goalId, null);

  it("draws one bar per week up to race day", () => {
    expect(demo.weeks).toHaveLength(demo.goal.weeks);
  });

  it("splits the weeks into phases that add up to the plan", () => {
    expect(demo.phases.reduce((total, phase) => total + phase.weeks, 0)).toBe(demo.goal.weeks);
    expect(demo.phases.every((phase) => phase.weeks > 0)).toBe(true);
  });

  it("never draws a bar taller than the chart", () => {
    for (const week of demo.weeks) {
      const height = week.segments.reduce((total, segment) => total + segment.height, 0);
      expect(height).toBeLessThanOrEqual(100);
    }
  });

  it("places the current week inside the plan", () => {
    expect(demo.currentWeek).toBeGreaterThan(1);
    expect(demo.currentWeek).toBeLessThan(demo.goal.weeks);
  });
});

describe.each(allScenarios)("planDemo with the %s scenario", (scenarioId: ScenarioId) => {
  it.each(allGoals)("adjusts at least one session of the %s week", (goalId) => {
    const demo = planDemo(goalId, scenarioId);

    expect(demo.adjustedDays).toBeGreaterThan(0);
    expect(demo.weeks.find((week) => week.state === "adjusted")?.label).toBe("AJUSTÉE");
    expect(demo.messages.map((message) => message.side)).toEqual(["in", "out", "in"]);
    expect(demo.messages[2]?.attachments?.items).toHaveLength(demo.adjustedDays);
  });
});

describe("scenario specifics", () => {
  it("bad night: Tuesday's key session moves to Thursday, Tuesday turns easy", () => {
    const days = planDemo("triathlon-l", "bad-night").days;
    expect(days[1]).toMatchObject({ title: "Endurance", zone: 2, adjusted: true });
    expect(days[3]).toMatchObject({ day: "Jeu", title: "Sweet spot", zone: 3, adjusted: true });
  });

  it("rain: the long session swaps to Sunday, Saturday goes indoor", () => {
    const days = planDemo("marathon", "rain").days;
    expect(days[5]).toMatchObject({ day: "Sam", sport: "Tapis", adjusted: true });
    expect(days[6]).toMatchObject({ day: "Dim", title: "Sortie longue", adjusted: true });
  });

  it("missed session: the current week loses volume", () => {
    const planned = planDemo("cyclo", null);
    const adjusted = planDemo("cyclo", "missed-session");
    const total = (demo: typeof planned) =>
      demo.weeks[demo.currentWeek - 1]?.segments.reduce((sum, segment) => sum + segment.height, 0) ?? 0;
    expect(total(adjusted)).toBeLessThan(total(planned));
  });
});
