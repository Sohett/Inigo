import { describe, expect, it } from "vitest";
import { ensureApply, WriteBlockedError } from "./writeGuard";

describe("ensureApply", () => {
  it("throws WriteBlockedError when not applied", () => {
    expect(() => ensureApply(false, "test action")).toThrow(WriteBlockedError);
    expect(() => ensureApply(false, "test action")).toThrow(/--apply/);
  });

  it("passes when applied", () => {
    expect(() => ensureApply(true, "test action")).not.toThrow();
  });
});
