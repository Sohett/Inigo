import type { ManagedAgentBrain } from "../brain/managedAgents";
import type { BrainInventory } from "../domain/brain";
import type { OnboardingSettings } from "../domain/onboarding";
import type { OnboardingSettingsRepository } from "../repositories/onboardingSettingsRepository";
import type { WhatsappGatewayRepository } from "../repositories/whatsappGatewayRepository";
import { settle } from "./settle";

export interface AdminSettings {
  /** What exists in the control plane, to pick the onboarding agents. Null if unreachable. */
  inventory: BrainInventory | null;
  inventoryError: string | null;
  /** The recorded WhatsApp gateway session. Null when none is set, or it could not be read. */
  whatsappSessionId: string | null;
  whatsappSessionError: string | null;
  /** Inigo's WhatsApp number, on the gateway. Null when none is set, or it could not be read. */
  whatsappNumber: string | null;
  whatsappNumberError: string | null;
  /** The onboarding agents and access code. Null when they could not be read. */
  onboardingSettings: OnboardingSettings | null;
  onboardingSettingsError: string | null;
}

export interface LoadAdminSettingsDeps {
  brain: ManagedAgentBrain;
  gateway: WhatsappGatewayRepository;
  onboardingSettings: OnboardingSettingsRepository;
}

export interface LoadAdminSettings {
  execute(): Promise<AdminSettings>;
}

/**
 * Everything the settings page shows. Each read fails on its own: an unreadable setting
 * renders as a visible problem on its card, never as a 500 that hides the others.
 */
export function createLoadAdminSettings(deps: LoadAdminSettingsDeps): LoadAdminSettings {
  return {
    async execute(): Promise<AdminSettings> {
      const [gateway, whatsappNumber, settings, inventory] = await Promise.all([
        settle(deps.gateway.getSessionId()),
        settle(deps.gateway.getWhatsappNumber()),
        settle(deps.onboardingSettings.get()),
        settle(deps.brain.listInventory())
      ]);
      return {
        inventory: inventory.value,
        inventoryError: inventory.error,
        whatsappSessionId: gateway.value,
        whatsappSessionError: gateway.error,
        whatsappNumber: whatsappNumber.value,
        whatsappNumberError: whatsappNumber.error,
        onboardingSettings: settings.value,
        onboardingSettingsError: settings.error
      };
    }
  };
}
