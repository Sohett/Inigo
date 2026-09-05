import { describe, it, expect } from "vitest";
import type { brainConfig } from "@inigo/db";
import { toBrainSessionTemplate } from "./drizzleBrainConfigRepository";

type BrainConfigRow = typeof brainConfig.$inferSelect;

const row: BrainConfigRow = {
  id: "default",
  coordinatorAgentId: "agent_coord",
  environmentId: "env_1",
  vaultIds: ["vlt_1", "vlt_2"],
  memoryStoreId: "memstore_1",
  memoryStoreAccess: "read_only",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-05T12:00:00Z")
};

describe("toBrainSessionTemplate", () => {
  it("maps a row onto the domain template", () => {
    expect(toBrainSessionTemplate(row)).toEqual({
      coordinatorAgentId: "agent_coord",
      environmentId: "env_1",
      vaultIds: ["vlt_1", "vlt_2"],
      memoryStoreId: "memstore_1",
      memoryStoreAccess: "read_only",
      updatedAt: new Date("2026-09-05T12:00:00Z")
    });
  });

  it("keeps a missing memory store as null", () => {
    expect(toBrainSessionTemplate({ ...row, memoryStoreId: null }).memoryStoreId).toBeNull();
  });

  it("exposes no DB-only column (id, createdAt) to the domain", () => {
    expect(Object.keys(toBrainSessionTemplate(row)).sort()).toEqual(
      [
        "coordinatorAgentId",
        "environmentId",
        "memoryStoreAccess",
        "memoryStoreId",
        "updatedAt",
        "vaultIds"
      ].sort()
    );
  });
});
