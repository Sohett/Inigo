import type { BrainElement, BrainInventory, SessionElements } from "../domain/brain";

/**
 * What a session the backend opens on its own runs on (onboarding, then the coordinator after
 * the hand-off): the given agent, and the one environment, vault and knowledge base of the
 * workspace, the knowledge base read only. With none or several, guessing would be worse than
 * refusing. Returns the reason to fix instead when the inventory does not allow it.
 */
export function sessionElementsFrom(inventory: BrainInventory, agentId: string): SessionElements | string {
  if (!inventory.agents.some((agent) => agent.id === agentId)) return `agent ${agentId} does not exist in the workspace`;

  const environment = theOnly(inventory.environments, "environment");
  if (typeof environment === "string") return environment;

  const vault = theOnly(inventory.vaults, "vault");
  if (typeof vault === "string") return vault;

  const knowledgeBase = theOnly(inventory.memoryStores, "memory store");
  if (typeof knowledgeBase === "string") return knowledgeBase;

  return {
    agentId,
    environmentId: environment.id,
    vaultIds: [vault.id],
    resources: [{ kind: "memory_store", memoryStoreId: knowledgeBase.id, access: "read_only", instructions: null }]
  };
}

/** The workspace's one element of a kind, or why there is not exactly one. */
function theOnly(elements: readonly BrainElement[], kind: string): BrainElement | string {
  const [only, ...others] = elements;
  if (!only || others.length > 0) return `expected exactly one ${kind}, found ${elements.length}`;
  return only;
}
