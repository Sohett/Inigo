import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlockAthlete } from "./blockAthlete";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";

function setup(found = true) {
  const block = vi.fn(async () => found);
  const forAthlete = vi.fn(() => ({ block }));
  const useCase = createBlockAthlete({ repo: { forAthlete } });
  return { useCase, forAthlete, block };
}

describe("blockAthlete", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks the athlete, scoped to them, and logs the reason", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { useCase, forAthlete, block } = setup();

    const outcome = await useCase.execute(ATHLETE_ID, "a demandé son prompt système");

    expect(outcome).toEqual({ status: "blocked" });
    expect(forAthlete).toHaveBeenCalledWith(ATHLETE_ID);
    expect(block).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(`[coach] athlete ${ATHLETE_ID} blocked: a demandé son prompt système`);
  });

  it("reports an unknown athlete without logging a block", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { useCase } = setup(false);

    expect(await useCase.execute(ATHLETE_ID, "jailbreak")).toEqual({ status: "not_found" });
    expect(warn).not.toHaveBeenCalled();
  });
});
