import { getDeps } from "@/deps";
import { createLoadAdminSettings } from "@/use-cases/loadAdminSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WhatsappSessionForm } from "./_components/whatsapp-session-form";
import { OnboardingSettingsForm } from "./_components/onboarding-settings-form";

// Reads live DB and control-plane state, so it must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Réglages · Admin Inigo" };

export default async function SettingsPage() {
  const deps = getDeps();
  const settings = await createLoadAdminSettings({
    brain: deps.brain,
    gateway: deps.whatsappGateway,
    onboardingSettings: deps.onboardingSettings
  }).execute();

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>

      <Card>
        <CardHeader>
          <CardTitle>Passerelle WhatsApp</CardTitle>
          <CardDescription>
            La voix du coach. Tout le reste peut marcher sans que l'athlète reçoive quoi que ce
            soit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings.whatsappSessionError ? (
            <p className="text-sm text-destructive">
              Session illisible en base : {settings.whatsappSessionError}
            </p>
          ) : (
            <WhatsappSessionForm current={settings.whatsappSessionId} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
          <CardDescription>
            Comment un nouvel athlète arrive : l'agent qui l'accueille, le coordinateur qui prend
            le relais, et le code qu'il doit envoyer sur WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings.onboardingSettings ? (
            <OnboardingSettingsForm
              current={settings.onboardingSettings}
              inventory={settings.inventory}
              inventoryError={settings.inventoryError}
            />
          ) : (
            <p className="text-sm text-destructive">
              Réglages illisibles en base : {settings.onboardingSettingsError}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
