import type { Metadata } from "next";
import { ConnectionResult, parseConnectionResult } from "@/domain/intervalsConnection";
import { BackToWhatsapp, ConnectShell } from "../_components/connect-shell";
import { RESULT_COPY } from "../_components/result-copy";
import { loadWhatsappNumber } from "../_components/whatsapp-number";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Intervals.icu · Inigo",
  robots: { index: false, follow: false }
};

/**
 * Where the callback lands the athlete (INI-69): how the connection ended, and the way back to
 * the WhatsApp conversation. Only the result travels in the URL, never a token.
 */
export default async function ConnectIntervalsDonePage({ searchParams }: { searchParams: Promise<{ result?: string | string[] }> }) {
  const { result } = await searchParams;
  const status = parseConnectionResult(typeof result === "string" ? result : undefined);
  const copy = RESULT_COPY[status];

  return (
    <ConnectShell title={copy.title}>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <BackToWhatsapp
        whatsappNumber={await loadWhatsappNumber()}
        variant={status === ConnectionResult.Connected ? "default" : "outline"}
      />
    </ConnectShell>
  );
}
