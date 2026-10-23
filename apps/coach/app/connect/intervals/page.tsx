import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDeps } from "@/deps";
import { ConnectionResult } from "@/domain/intervalsConnection";
import { intervalsOAuth } from "@/intervals/oauth/intervalsOAuth";
import { whoIsSignedIn } from "@/identity/sessions";
import { createStartIntervalsConnection, type StartConnectionOutcome } from "@/use-cases/startIntervalsConnection";
import { ActionLink, BackToWhatsapp, ConnectShell } from "./_components/connect-shell";
import { RESULT_COPY } from "./_components/result-copy";
import { loadWhatsappNumber } from "./_components/whatsapp-number";

// Every visit reads its own session: never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connecter Intervals.icu · Inigo",
  robots: { index: false, follow: false },
  // Same origin only, so `/connect/intervals/start` can tell the click came from here, and no
  // other site ever learns where the athlete came from.
  referrer: "same-origin"
};

/**
 * The page a connection link lands on (INI-69): whose Inigo account it connects, what Inigo will
 * do with Intervals.icu, and the button to grant it there. The link is a magic link that signed
 * the athlete in on the way (INI-85); one that could not comes back here with `?error=`, and the
 * page says why. The button goes through `/connect/intervals/start`, which binds the flow to this
 * browser before leaving for Intervals.icu.
 */
export default async function ConnectIntervalsPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { error } = await searchParams;
  const outcome = await startOutcome(error !== undefined);

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
      <ActionLink href="/connect/intervals/start">Connecter Intervals.icu</ActionLink>
      <p className="text-xs text-muted-foreground">
        Tu peux retirer cet accès à tout moment depuis Intervals.icu, dans Settings, Apps.
      </p>
    </ConnectShell>
  );
}

/** A page about a link must never be a 500: an unreadable database reads as a failed attempt. */
async function startOutcome(linkFailed: boolean): Promise<StartConnectionOutcome | { status: typeof ConnectionResult.Failed }> {
  try {
    const signedIn = await whoIsSignedIn(await headers());
    return await createStartIntervalsConnection({ oauth: intervalsOAuth(), repo: getDeps().repo }).execute({ signedIn, linkFailed });
  } catch (error) {
    console.error("[coach] could not open the Intervals.icu connection page", error);
    return { status: ConnectionResult.Failed };
  }
}
