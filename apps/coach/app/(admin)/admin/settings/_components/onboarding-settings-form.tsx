"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrainInventory } from "@/domain/brain";
import type { OnboardingSettings } from "@/domain/onboarding";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Server error codes mapped to something an operator can act on. */
const ERROR_COPY: Record<string, string> = {
  unauthorized: "Session admin expirée. Recharge la page pour te réidentifier.",
  invalid_json: "Requête malformée.",
  invalid_onboarding_settings:
    "Réglages invalides : le code fait au moins 4 caractères.",
  admin_not_configured: "Admin non configuré côté serveur. Voir les logs.",
  onboarding_settings_update_failed: "La base a refusé l'écriture. Voir les logs du serveur."
};

export interface OnboardingSettingsFormProps {
  current: OnboardingSettings;
  /** Read live from the control plane. Null when Anthropic could not be reached. */
  inventory: BrainInventory | null;
  inventoryError: string | null;
}

/**
 * Set how a new athlete is onboarded: the agent that runs onboarding, the coordinator it hands
 * the athlete to, and the access code an unknown number must send. Agents are picked from the
 * live inventory, so an id can neither be mistyped nor point at something that no longer exists.
 */
export function OnboardingSettingsForm({ current, inventory, inventoryError }: OnboardingSettingsFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!inventory) {
    return (
      <p className="text-xs text-destructive">
        Inventaire Anthropic illisible, impossible de choisir les agents.
        {inventoryError ? ` (${inventoryError})` : ""}
      </p>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (name: string) => String(form.get(name) ?? "");
    setMessage(null);
    setSaved(false);

    let response: Response;
    try {
      response = await fetch("/api/admin/onboarding-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          onboardingAgentId: read("onboardingAgentId"),
          coordinatorAgentId: read("coordinatorAgentId"),
          accessCode: read("accessCode")
        })
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
  }

  const agentSelect = (name: string, label: string, value: string | null) => (
    <div className="grid gap-1">
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <select id={name} name={name} className={SELECT_CLASS} defaultValue={value ?? ""}>
        <option value="">Aucun</option>
        {inventory.agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name} · v{agent.version}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {agentSelect("onboardingAgentId", "Agent d'onboarding", current.onboardingAgentId)}
        {agentSelect("coordinatorAgentId", "Coordinateur (après l'onboarding)", current.coordinatorAgentId)}
        <div className="grid gap-1">
          <Label htmlFor="accessCode" className="text-xs">
            Code d'accès
          </Label>
          <Input
            id="accessCode"
            name="accessCode"
            defaultValue={current.accessCode ?? ""}
            placeholder="ex. VELO26"
            className="h-8 font-mono text-xs"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Enregistrer
        </Button>
        {saved ? <Check className="size-4 text-muted-foreground" /> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Un numéro inconnu qui envoie le code devient un athlète en onboarding, avec une session de
        l'agent d'onboarding. Sans code, il reçoit la réponse fixe. Sans agent ou sans code,
        l'onboarding est coupé et les inconnus sont ignorés.
      </p>
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </form>
  );
}
