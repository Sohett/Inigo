import { describe, expect, it, vi } from "vitest";
import type { Athlete } from "../domain/athlete";
import type { BrainInventory } from "../domain/brain";
import type { OnboardingSettings } from "../domain/onboarding";
import { createHandOffToCoordinator } from "./handOffToCoordinator";

const COORDINATOR = "agent_coordinator";
const SETTINGS: OnboardingSettings = {
  onboardingAgentId: "agent_onboarding",
  coordinatorAgentId: COORDINATOR,
  accessCode: "VELO26"
};
const INVENTORY: BrainInventory = {
  agents: [{ id: COORDINATOR, name: "inigo-coordinateur", version: 24, isCoordinator: true }],
  environments: [{ id: "env_1", name: "prod" }],
  vaults: [{ id: "vlt_1", name: "inigo" }],
  memoryStores: [{ id: "memstore_1", name: "Inigo Knowledge Base" }]
};
const ATHLETE: Athlete = {
  id: "athlete-1",
  displayName: null,
  phoneNum: "+32470000001",
  whatsappLid: null,
  chatId: "32470000001@c.us",
  status: "onboarding",
  activeSession: { sessionId: "sesn_onboarding", agentId: "agent_onboarding" }
};

function setup(overrides: { settings?: OnboardingSettings; inventory?: BrainInventory } = {}) {
  const calls: string[] = [];
  const brain = {
    listInventory: vi.fn(async () => overrides.inventory ?? INVENTORY),
    createSession: vi.fn(async () => {
      calls.push("createSession");
      return { sessionId: "sesn_coordinator", agentVersion: 24 };
    })
  };
  const completeOnboarding = vi.fn(async () => {
    calls.push("completeOnboarding");
  });
  const useCase = createHandOffToCoordinator({
    repo: { completeOnboarding },
    settings: { get: vi.fn(async () => overrides.settings ?? SETTINGS) },
    brain,
    now: () => new Date("2026-10-12T10:00:00Z")
  });
  return { useCase, brain, completeOnboarding, calls };
}

describe("handOffToCoordinator", () => {
  it("opens a coordinator session, then makes the athlete active on it", async () => {
    const { useCase, brain, completeOnboarding, calls } = setup();

    expect(await useCase.execute(ATHLETE)).toEqual({ status: "handed_off", sessionId: "sesn_coordinator" });
    expect(calls).toEqual(["createSession", "completeOnboarding"]);
    expect(brain.createSession).toHaveBeenCalledWith({
      agentId: COORDINATOR,
      environmentId: "env_1",
      vaultIds: ["vlt_1"],
      resources: [{ kind: "memory_store", memoryStoreId: "memstore_1", access: "read_only", instructions: null }],
      title: "Inigo · +32470000001 · 2026-10-12"
    });
    expect(completeOnboarding).toHaveBeenCalledWith("athlete-1", "sesn_coordinator", COORDINATOR);
  });

  it("changes nothing without a coordinator set", async () => {
    const { useCase, brain, completeOnboarding } = setup({ settings: { ...SETTINGS, coordinatorAgentId: null } });

    expect(await useCase.execute(ATHLETE)).toEqual({ status: "not_configured", reason: "no coordinator agent set" });
    expect(brain.listInventory).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("changes nothing when the coordinator does not exist in the workspace", async () => {
    const { useCase, brain, completeOnboarding } = setup({ inventory: { ...INVENTORY, agents: [] } });

    expect(await useCase.execute(ATHLETE)).toMatchObject({ status: "not_configured", reason: /does not exist/ });
    expect(brain.createSession).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("leaves the athlete in onboarding when the session cannot be created", async () => {
    const { useCase, brain, completeOnboarding } = setup();
    brain.createSession.mockRejectedValueOnce(new Error("anthropic 500"));

    await expect(useCase.execute(ATHLETE)).rejects.toThrow("anthropic 500");
    expect(completeOnboarding).not.toHaveBeenCalled();
  });
});
