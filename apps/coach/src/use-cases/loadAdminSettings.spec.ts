import { describe, it, expect, vi } from "vitest";
import type { BrainInventory } from "../domain/brain";
import { createLoadAdminSettings, type LoadAdminSettingsDeps } from "./loadAdminSettings";

const inventory: BrainInventory = {
  agents: [{ id: "agent_coord", name: "inigo-coordinateur", version: 16, isCoordinator: true }],
  environments: [{ id: "env_1", name: "Inigo Cloud Env" }],
  vaults: [{ id: "vlt_1", name: "Inigo Coach" }],
  memoryStores: [{ id: "memstore_1", name: "Inigo Knowledge Base" }]
};

const onboardingSettings = {
  onboardingAgentId: "agent_onboarding",
  coordinatorAgentId: "agent_coord",
  accessCode: "VELO26"
};

function makeDeps(
  overrides: {
    getSessionId?: LoadAdminSettingsDeps["gateway"]["getSessionId"];
    getOnboardingSettings?: LoadAdminSettingsDeps["onboardingSettings"]["get"];
    listInventory?: LoadAdminSettingsDeps["brain"]["listInventory"];
  } = {}
): LoadAdminSettingsDeps {
  return {
    gateway: {
      getSessionId: vi.fn(overrides.getSessionId ?? (() => Promise.resolve("gateway-session"))),
      setSessionId: vi.fn()
    },
    onboardingSettings: {
      get: vi.fn(overrides.getOnboardingSettings ?? (() => Promise.resolve(onboardingSettings))),
      set: vi.fn()
    },
    brain: {
      appendUserMessage: vi.fn(),
      createSession: vi.fn(),
      readSession: vi.fn(),
      listInventory: vi.fn(overrides.listInventory ?? (() => Promise.resolve(inventory)))
    }
  };
}

describe("loadAdminSettings", () => {
  it("reads the gateway session, the onboarding settings and the inventory", async () => {
    const settings = await createLoadAdminSettings(makeDeps()).execute();

    expect(settings).toEqual({
      inventory,
      inventoryError: null,
      whatsappSessionId: "gateway-session",
      whatsappSessionError: null,
      onboardingSettings,
      onboardingSettingsError: null
    });
  });

  it("degrades each unreadable setting on its own", async () => {
    const settings = await createLoadAdminSettings(
      makeDeps({
        getSessionId: () => Promise.reject(new Error("gateway row corrupt")),
        getOnboardingSettings: () => Promise.reject(new Error("neon down")),
        listInventory: () => Promise.reject(new Error("anthropic down"))
      })
    ).execute();

    expect(settings).toEqual({
      inventory: null,
      inventoryError: "anthropic down",
      whatsappSessionId: null,
      whatsappSessionError: "gateway row corrupt",
      onboardingSettings: null,
      onboardingSettingsError: "neon down"
    });
  });
});
