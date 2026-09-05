import { describe, it, expect, vi } from "vitest";
import type { BrainSessionTemplate } from "../domain/brain";
import { createUpdateBrainConfig } from "./updateBrainConfig";

const saved: BrainSessionTemplate = {
  coordinatorAgentId: "agent_coord",
  environmentId: "env_1",
  vaultIds: ["vlt_1"],
  memoryStoreId: "memstore_1",
  memoryStoreAccess: "read_only",
  updatedAt: new Date("2026-09-05T12:00:00Z")
};

function makeDeps() {
  const save = vi.fn(() => Promise.resolve(saved));
  return { deps: { brainConfig: { get: vi.fn(), save } }, save };
}

const valid = {
  coordinatorAgentId: "agent_coord",
  environmentId: "env_1",
  vaultIds: ["vlt_1"],
  memoryStoreId: "memstore_1",
  memoryStoreAccess: "read_only"
};

describe("updateBrainConfig", () => {
  it("saves a valid template", async () => {
    const { deps, save } = makeDeps();

    const outcome = await createUpdateBrainConfig(deps).execute(valid);

    expect(save).toHaveBeenCalledWith(valid);
    expect(outcome).toEqual({ status: "saved", template: saved });
  });

  it("defaults the optional fields", async () => {
    const { deps, save } = makeDeps();

    await createUpdateBrainConfig(deps).execute({
      coordinatorAgentId: "agent_coord",
      environmentId: "env_1"
    });

    expect(save).toHaveBeenCalledWith({
      coordinatorAgentId: "agent_coord",
      environmentId: "env_1",
      vaultIds: [],
      memoryStoreId: null,
      memoryStoreAccess: "read_only"
    });
  });

  it("rejects ids with the wrong prefix, naming every offending field", async () => {
    const { deps, save } = makeDeps();

    const outcome = await createUpdateBrainConfig(deps).execute({
      ...valid,
      coordinatorAgentId: "env_oops",
      environmentId: "agent_oops"
    });

    expect(outcome.status).toBe("invalid");
    if (outcome.status !== "invalid") throw new Error("expected invalid");
    expect(outcome.issues).toHaveLength(2);
    expect(outcome.issues.join(" ")).toContain("coordinatorAgentId");
    expect(outcome.issues.join(" ")).toContain("environmentId");
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects a payload that is not an object", async () => {
    const { deps, save } = makeDeps();

    const outcome = await createUpdateBrainConfig(deps).execute("nope");

    expect(outcome.status).toBe("invalid");
    expect(save).not.toHaveBeenCalled();
  });
});
