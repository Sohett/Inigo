import { describe, it, expect } from "vitest";
import { consoleSessionUrl } from "./session-link";

describe("consoleSessionUrl", () => {
  it("points at the session in the Console's session viewer", () => {
    expect(consoleSessionUrl("sesn_011CZkZAtmR3yMPDzynEDxu7")).toBe(
      "https://platform.claude.com/workspaces/default/sessions/sesn_011CZkZAtmR3yMPDzynEDxu7"
    );
  });
});
