import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

/**
 * The frame of the athlete-facing connection pages (INI-69): opened from WhatsApp, so mostly on a
 * phone. Same neutral palette as the rest of the app; no admin chrome.
 */
export function ConnectShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="grid w-full max-w-sm gap-6">
        <p className="text-center text-sm font-semibold tracking-[0.2em] text-muted-foreground uppercase">Inigo</p>
        <section className="grid gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {children}
        </section>
      </div>
    </main>
  );
}

/** A full width call to action, as a plain link (it leaves the app). */
export function ActionLink({ href, children, variant = "default" }: { href: string; children: ReactNode; variant?: "default" | "outline" }) {
  return (
    <a href={href} className={buttonVariants({ variant, size: "lg", className: "h-11 w-full text-base" })}>
      {children}
    </a>
  );
}

/** Back to the conversation with Inigo, when its number is set in the admin. */
export function BackToWhatsapp({ whatsappNumber, variant }: { whatsappNumber: string | null; variant?: "default" | "outline" }) {
  if (!whatsappNumber) return null;
  return (
    <ActionLink href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`} variant={variant}>
      Retourner sur WhatsApp
    </ActionLink>
  );
}
