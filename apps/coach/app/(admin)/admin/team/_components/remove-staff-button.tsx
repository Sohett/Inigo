"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const ERROR_COPY: Record<string, string> = {
  unauthorized: "Session expirée.",
  forbidden: "Réservé à l'équipe.",
  invalid_json: "Requête malformée.",
  invalid_email: "Adresse invalide.",
  admin_not_configured: "Admin non configuré. Voir les logs.",
  cannot_remove_yourself: "Impossible de te retirer de l'équipe.",
  not_member: "Déjà retiré.",
  staff_remove_failed: "La base a refusé. Voir les logs."
};

/** Two clicks, no browser dialog: "Retirer", then "Confirmer". */
export function RemoveStaffButton({ email }: { email: string }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const remove = async () => {
    setMessage(null);
    let response: Response;
    try {
      response = await fetch("/api/admin/staff", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
    } catch {
      setMessage("Serveur injoignable.");
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) {
      setMessage(ERROR_COPY[body.error ?? ""] ?? "Échec.");
      setConfirming(false);
      return;
    }
    startTransition(() => router.refresh());
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {message ? <span className="text-xs text-destructive">{message}</span> : null}
      {confirming ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
          <Button variant="destructive" size="sm" onClick={remove} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirmer
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Retirer
        </Button>
      )}
    </div>
  );
}
