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
  invalid_session_id: "Session invalide : renseigne le nom ou l'id de la session OpenWA.",
  admin_not_configured: "Admin non configuré côté serveur. Voir les logs.",
  whatsapp_session_update_failed: "La base a refusé l'écriture. Voir les logs du serveur."
};

export interface WhatsappSessionFormProps {
  /** The session currently recorded, or null when none has been set yet. */
  current: string | null;
}

/**
 * Set the WhatsApp gateway session the coach sends through.
 *
 * It changes every time the WhatsApp session is re-paired (dropped session, QR rescanned), so
 * it lives in the database rather than in the environment: fixing the coach's voice is a form,
 * not a redeploy.
 */
export function WhatsappSessionForm({ current }: WhatsappSessionFormProps) {
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
      response = await fetch("/api/admin/whatsapp-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: value })
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
      <Label htmlFor="whatsapp-session">Session de la passerelle WhatsApp</Label>
      <div className="flex items-center gap-2">
        <Input
          id="whatsapp-session"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          placeholder="nom ou id de la session OpenWA"
          className="max-w-md font-mono text-xs"
        />
        <Button type="submit" disabled={pending || value.trim().length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Enregistrer
        </Button>
        {saved ? <Check className="size-4 text-muted-foreground" /> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Le coach envoie ses réponses via cette session. Elle change à chaque ré-appairage
        WhatsApp (session tombée, QR rescanné). Sans elle, le coach reste muet.
      </p>
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </form>
  );
}
