"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Server error codes mapped to something an operator can act on. */
const ERROR_COPY: Record<string, string> = {
  unauthorized: "Session admin expirée. Recharge la page pour te réidentifier.",
  invalid_json: "Requête malformée.",
  invalid_whatsapp_number: "Numéro invalide : il commence par + et l'indicatif du pays.",
  whatsapp_session_missing: "Enregistre d'abord la session de la passerelle.",
  admin_not_configured: "Admin non configuré côté serveur. Voir les logs.",
  whatsapp_number_update_failed: "La base a refusé l'écriture. Voir les logs du serveur."
};

export interface WhatsappNumberFormProps {
  /** The number currently recorded, or null when none has been set yet. */
  current: string | null;
}

/**
 * Set Inigo's own WhatsApp number: the way back to the conversation from a web page, e.g. after
 * connecting Intervals.icu. It belongs to the gateway, next to its session.
 */
export function WhatsappNumberForm({ current }: WhatsappNumberFormProps) {
  const [value, setValue] = useState(current ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setSaved(false);

    let response: Response;
    try {
      response = await fetch("/api/admin/whatsapp-number", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ whatsappNumber: value })
      });
    } catch {
      setMessage("Le serveur est injoignable.");
      return;
    }

    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) {
      setMessage(ERROR_COPY[body.error ?? ""] ?? "L'enregistrement a échoué.");
      return;
    }

    setSaved(true);
    startTransition(() => router.refresh());
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor="whatsapp-number">Numéro WhatsApp d'Inigo</Label>
      <div className="flex items-center gap-2">
        <Input
          id="whatsapp-number"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          placeholder="ex. +32470123456"
          className="max-w-md font-mono text-xs"
        />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Enregistrer
        </Button>
        {saved ? <Check className="size-4 text-muted-foreground" /> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Sert au bouton qui ramène l'athlète dans la conversation après la connexion Intervals.icu.
        Vide, la page n'a simplement pas de bouton.
      </p>
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </form>
  );
}
