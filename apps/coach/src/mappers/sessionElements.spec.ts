import { describe, expect, it } from "vitest";
import type { BrainInventory } from "../domain/brain";
import { sessionElementsFrom } from "./sessionElements";

const AGENT = "agent_onboarding";
const INVENTORY: BrainInventory = {
  agents: [{ id: AGENT, name: "Inigo Onboarding Agent", version: 6, isCoordinator: false }],
  environments: [{ id: "env_1", name: "prod" }],
  vaults: [{ id: "vlt_1", name: "inigo" }],
  memoryStores: [{ id: "memstore_1", name: "Inigo Knowledge Base" }]
};

describe("sessionElementsFrom", () => {
  it("uses the agent with the single environment and vault, and the knowledge base read only", () => {
    expect(sessionElementsFrom(INVENTORY, AGENT)).toEqual({
      agentId: AGENT,
      environmentId: "env_1",
      vaultIds: ["vlt_1"],
      resources: [{ kind: "memory_store", memoryStoreId: "memstore_1", access: "read_only", instructions: null }]
    });
  });

  it.each<[string, BrainInventory, RegExp]>([
    ["an unknown agent", { ...INVENTORY, agents: [] }, /does not exist/],
    ["no environment", { ...INVENTORY, environments: [] }, /exactly one environment, found 0/],
    [
      "two environments",
      { ...INVENTORY, environments: [...INVENTORY.environments, { id: "env_2", name: "dev" }] },
      /exactly one environment, found 2/
    ],
    ["no vault", { ...INVENTORY, vaults: [] }, /exactly one vault, found 0/],
    ["no knowledge base", { ...INVENTORY, memoryStores: [] }, /exactly one memory store, found 0/]
  ])("refuses %s", (_label, inventory, reason) => {
    expect(sessionElementsFrom(inventory, AGENT)).toMatch(reason);
  });
});
