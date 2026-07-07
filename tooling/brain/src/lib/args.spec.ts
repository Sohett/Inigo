import { describe, expect, it } from "vitest";
import { getOption, hasFlag, positionals } from "./args";

describe("args", () => {
  it("detects bare boolean flags", () => {
    expect(hasFlag(["--apply"], "apply")).toBe(true);
    expect(hasFlag(["--attach"], "apply")).toBe(false);
    expect(hasFlag([], "apply")).toBe(false);
  });

  it("reads --key=value options", () => {
    expect(getOption(["--agent=agent_1"], "agent")).toBe("agent_1");
    expect(getOption(["--hosts=a,b"], "hosts")).toBe("a,b");
    expect(getOption(["--agent"], "agent")).toBeUndefined();
    expect(getOption([], "agent")).toBeUndefined();
  });

  it("returns non-flag arguments as positionals", () => {
    expect(positionals(["skill-name", "--apply", "--agent=x"])).toEqual(["skill-name"]);
    expect(positionals(["--apply"])).toEqual([]);
  });
});
