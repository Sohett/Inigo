import type { Metadata } from "next";
import { intervalsOAuthConfig } from "@/intervals/oauth/credentials";
import { createStartIntervalsConnection } from "@/use-cases/startIntervalsConnection";
import { ActionLink, BackToWhatsapp, ConnectShell } from "./_components/connect-shell";
import { RESULT_COPY } from "./_components/result-copy";
import { loadWhatsappNumber } from "./_components/whatsapp-number";

// Every visit verifies its own link: never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connecter Intervals.icu · Inigo",
  robots: { index: false, follow: false },
  // The link token is in this page's URL: never hand it to another site as a referrer.
  referrer: "no-referrer"
};

/**
 * The page a connection link opens (INI-69): what Inigo will do with Intervals.icu, and the
 * button to grant it there. A link that cannot be used says why instead.
 */
export default async function ConnectIntervalsPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  const outcome = createStartIntervalsConnection({ oauth: intervalsOAuthConfig() }).execute(typeof t === "string" ? t : undefined);

  if (outcome.status !== "ready") {
    const copy = RESULT_COPY[outcome.status];
    return (
      <ConnectShell title={copy.title}>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <BackToWhatsapp whatsappNumber={await loadWhatsappNumber()} />
      </ConnectShell>
    );
  }

  return (
    <ConnectShell title="Connecte ton compte Intervals.icu">
      <p className="text-sm text-muted-foreground">
        Inigo s&apos;appuie sur Intervals.icu pour suivre tes séances et ta forme, et pour y écrire ton plan. Tu vas
        autoriser cet accès directement sur Intervals.icu.
      </p>
      <ul className="grid gap-2 text-sm">
        <li>Lire tes activités, ta forme et ton wellness</li>
        <li>Écrire tes séances planifiées dans ton calendrier</li>
        <li>Mettre à jour tes seuils (FTP, zones) et tes données corporelles</li>
      </ul>
      <ActionLink href={outcome.authorizeUrl}>Connecter Intervals.icu</ActionLink>
      <p className="text-xs text-muted-foreground">
        Tu peux retirer cet accès à tout moment depuis Intervals.icu, dans Settings, Apps.
      </p>
    </ConnectShell>
  );
}
