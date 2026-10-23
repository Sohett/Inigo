"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Server error codes mapped to something an operator can act on. */
const ERROR_COPY: Record<string, string> = {
  unauthorized: "Session admin expirée. Recharge la page pour te reconnecter.",
  forbidden: "Ce navigateur n'est pas connecté comme coach.",
  invalid_json: "Requête malformée.",
  invalid_email: "Adresse email invalide.",
  already_invited: "Cette adresse est déjà invitée.",
  admin_not_configured: "Admin non configuré côté serveur. Voir les logs.",
  coach_invite_failed: "La base a refusé l'écriture. Voir les logs du serveur."
};

/** Invite a coach by the email of their Google account. */
export function InviteCoachForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setInvited(null);

    let response: Response;
    try {
      response = await fetch("/api/admin/coaches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });
    } catch {
      setMessage("Le serveur est injoignable.");
      return;
    }

    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) {
      setMessage(ERROR_COPY[body.error ?? ""] ?? "L'invitation a échoué.");
      return;
    }

    setInvited(email.trim());
    setEmail("");
    startTransition(() => router.refresh());
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor="coach-email">Email Google du coach</Label>
      <div className="flex items-center gap-2">
        <Input
          id="coach-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ex. prenom.nom@gmail.com"
          className="max-w-md"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Inviter
        </Button>
      </div>
      {invited ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3" /> {invited} est invité. Lien à lui envoyer : {window.location.origin}/login
        </p>
      ) : null}
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </form>
  );
}
