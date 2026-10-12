import type { BrainInventory, SessionElements } from "../domain/brain";

/**
 * What a session the backend opens on its own runs on (onboarding, then the coordinator after
 * the hand-off): the given agent, and the one environment, vault and knowledge base of the
 * workspace, the knowledge base read only. With none or several, guessing would be worse than
 * refusing. Returns the reason to fix instead when the inventory does not allow it.
 */
export function sessionElementsFrom(inventory: BrainInventory, agentId: string): SessionElements | string {
  if (!inventory.agents.some((agent) => agent.id === agentId)) {
    return `agent ${agentId} does not exist in the workspace`;
  }
  const [environment, ...otherEnvironments] = inventory.environments;
  if (!environment || otherEnvironments.length > 0) {
    return `expected exactly one environment, found ${inventory.environments.length}`;
  }
  const [vault, ...otherVaults] = inventory.vaults;
  if (!vault || otherVaults.length > 0) {
    return `expected exactly one vault, found ${inventory.vaults.length}`;
  }
  const [knowledgeBase, ...otherMemoryStores] = inventory.memoryStores;
  if (!knowledgeBase || otherMemoryStores.length > 0) {
    return `expected exactly one memory store, found ${inventory.memoryStores.length}`;
  }
  return {
    agentId,
    environmentId: environment.id,
    vaultIds: [vault.id],
    resources: [{ kind: "memory_store", memoryStoreId: knowledgeBase.id, access: "read_only", instructions: null }]
  };
}
