import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { onboardingSettings } from "./schema/onboardingSettings";

export interface OnboardingSettingsRow {
  onboardingAgentId: string | null;
  coordinatorAgentId: string | null;
  accessCode: string | null;
}

const EMPTY: OnboardingSettingsRow = {
  onboardingAgentId: null,
  coordinatorAgentId: null,
  accessCode: null
};

/** Read the onboarding settings. Nothing recorded yet reads as every field unset, not an error. */
export async function getOnboardingSettings(db: Db): Promise<OnboardingSettingsRow> {
  const rows = await db
    .select({
      onboardingAgentId: onboardingSettings.onboardingAgentId,
      coordinatorAgentId: onboardingSettings.coordinatorAgentId,
      accessCode: onboardingSettings.accessCode
    })
    .from(onboardingSettings)
    .where(eq(onboardingSettings.id, true))
    .limit(1);
  return rows[0] ?? EMPTY;
}

/** Record the whole settings row. Upsert on the singleton, so the admin form never adds a row. */
export async function setOnboardingSettings(db: Db, settings: OnboardingSettingsRow): Promise<void> {
  await db
    .insert(onboardingSettings)
    .values({ id: true, ...settings })
    .onConflictDoUpdate({
      target: onboardingSettings.id,
      set: { ...settings, updatedAt: new Date() }
    });
}
