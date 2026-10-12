import { getOnboardingSettings, setOnboardingSettings, type Db } from "@inigo/db";
import type { OnboardingSettingsRepository } from "./onboardingSettingsRepository";

/** Drizzle adapter for `OnboardingSettingsRepository`, over the singleton `onboarding_settings` row. */
export function createDrizzleOnboardingSettingsRepository(db: Db): OnboardingSettingsRepository {
  return {
    get: () => getOnboardingSettings(db),
    set: (settings) => setOnboardingSettings(db, settings)
  };
}
