"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaffRole } from "@/domain/staff";

/** Server error codes mapped to something an operator can act on. */
const ERROR_COPY: Record<string, string> = {
  unauthorized: "Session admin expirée. Recharge la page pour te reconnecter.",
  forbidden: "Ce navigateur n'est pas connecté comme membre de l'équipe.",
  invalid_json: "Requête malformée.",
  invalid_invitation: "Adresse email invalide, ou aucun rôle coché.",
  already_member: "Cette adresse fait déjà partie de l'équipe.",
  admin_not_configured: "Admin non configuré côté serveur. Voir les logs.",
  staff_invite_failed: "La base a refusé l'écriture. Voir les logs du serveur."
};

const ROLES: { role: StaffRole; label: string; hint: string }[] = [
  { role: StaffRole.Admin, label: "Admin", hint: "gère le backoffice" },
  { role: StaffRole.Coach, label: "Coach", hint: "suit des athlètes" }
];

/** Invite someone by the email of their Google account, as admin, coach or both. */
export function InviteStaffForm() {
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>([StaffRole.Coach]);
  const [message, setMessage] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (role: StaffRole) =>
    setRoles((current) => (current.includes(role) ? current.filter((entry) => entry !== role) : [...current, role]));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setInvited(null);
    if (roles.length === 0) {
      setMessage("Coche au moins un rôle.");
      return;
    }

    let response: Response;
    try {
      response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), roles })
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
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="staff-email">Email Google</Label>
        <Input
          id="staff-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ex. prenom.nom@gmail.com"
          className="max-w-md"
          required
        />
      </div>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-sm font-medium">Rôles</legend>
        {ROLES.map(({ role, label, hint }) => (
          <label key={role} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={roles.includes(role)} onChange={() => toggle(role)} className="size-4" />
            <span>
              {label} <span className="text-muted-foreground">({hint})</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Inviter
        </Button>
      </div>
      {invited ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3" /> {invited} est invité. Lien à partager : {window.location.origin}/login
        </p>
      ) : null}
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </form>
  );
}
