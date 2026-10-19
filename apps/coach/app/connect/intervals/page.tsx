import type { Metadata } from "next";
import { getDeps } from "@/deps";
import { ConnectionResult } from "@/domain/intervalsConnection";
import { intervalsOAuth } from "@/intervals/oauth/intervalsOAuth";
import { createStartIntervalsConnection, type StartConnectionOutcome } from "@/use-cases/startIntervalsConnection";
import { ActionLink, BackToWhatsapp, ConnectShell } from "./_components/connect-shell";
import { RESULT_COPY } from "./_components/result-copy";
import { loadWhatsappNumber } from "./_components/whatsapp-number";

// Every visit verifies its own link: never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connecter Intervals.icu · Inigo",
  robots: { index: false, follow: false },
  // The link token is in this page's URL: never hand it to another site as a referrer. Same origin
  // only, so `/connect/intervals/start` can tell the click came from here.
  referrer: "same-origin"
};

/**
 * The page a connection link opens (INI-69): whose Inigo account the link connects, what Inigo
 * will do with Intervals.icu, and the button to grant it there. A link that cannot be used says
 * why instead. The button goes through `/connect/intervals/start`, which binds the flow to this
 * browser before leaving for Intervals.icu.
 */
export default async function ConnectIntervalsPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : undefined;
  const outcome = await startOutcome(token);

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
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        Compte Inigo de <strong>{outcome.holder.displayName ?? "ce numéro"}</strong>
        {outcome.holder.phoneHint ? <>, WhatsApp finissant par {outcome.holder.phoneHint}</> : null}. Si ce n&apos;est
        pas toi, ne va pas plus loin.
      </p>
      <ActionLink href={`/connect/intervals/start?t=${encodeURIComponent(token ?? "")}`}>Connecter Intervals.icu</ActionLink>
      <p className="text-xs text-muted-foreground">
        Tu peux retirer cet accès à tout moment depuis Intervals.icu, dans Settings, Apps.
      </p>
    </ConnectShell>
  );
}

/** A page about a link must never be a 500: an unreadable database reads as a failed attempt. */
async function startOutcome(token: string | undefined): Promise<StartConnectionOutcome | { status: typeof ConnectionResult.Failed }> {
  try {
    return await createStartIntervalsConnection({ oauth: intervalsOAuth(), repo: getDeps().repo }).execute(token);
  } catch (error) {
    console.error("[coach] could not read the Intervals.icu connection link", error);
    return { status: ConnectionResult.Failed };
  }
}
