import type { OnboardingSettings } from "../domain/onboarding";

/**
 * Port for the onboarding settings (INI-45): which agents run onboarding and take over after it,
 * and the access code. In the database, edited from the admin, because they change too often for
 * the environment.
 */
export interface OnboardingSettingsRepository {
  /** The recorded settings; every field is null when nothing has been set yet. */
  get(): Promise<OnboardingSettings>;
  /** Record the whole settings row. Idempotent, overwrites whatever was there. */
  set(settings: OnboardingSettings): Promise<void>;
}
