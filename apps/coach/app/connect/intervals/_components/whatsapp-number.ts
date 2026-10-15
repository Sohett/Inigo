import { getDeps } from "@/deps";

/**
 * Inigo's WhatsApp number from the onboarding settings, or null. A page about Intervals.icu must
 * never fail because Neon could not be read: it only loses its way back to WhatsApp.
 */
export async function loadWhatsappNumber(): Promise<string | null> {
  try {
    return (await getDeps().onboardingSettings.get()).whatsappNumber;
  } catch (error) {
    console.error("[coach] could not read Inigo's WhatsApp number", error);
    return null;
  }
}
