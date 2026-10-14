"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { BrainInventory } from "@/domain/brain";
import { startSession } from "./new-session-button";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

interface FirstSessionFormProps {
  athleteId: string;
  /** Read live from the control plane. Null when Anthropic could not be reached. */
  inventory: BrainInventory | null;
  inventoryError: string | null;
}

/**
 * Opens an athlete's **first** session, the only case with nothing to clone.
 *
 * Every option is read live from the control plane rather than typed by hand, so an id
 * can neither be mistyped nor point at something that no longer exists. The agent
 * defaults to the one carrying a `multiagent` roster (the coordinator), and any category
 * with a single option is pre-selected — today that leaves nothing to decide.
 */
export function FirstSessionForm({ athleteId, inventory, inventoryError }: FirstSessionFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!inventory) {
    return (
      <p className="text-xs text-destructive">
        Inventaire Anthropic illisible, impossible d'ouvrir une première session.
        {inventoryError ? ` (${inventoryError})` : ""}
      </p>
    );
  }

  const defaultAgent = inventory.agents.find((agent) => agent.isCoordinator) ?? inventory.agents[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (name: string) => String(form.get(name) ?? "");
    const vaultId = read("vaultId");
    const memoryStoreId = read("memoryStoreId");

    setRunning(true);
    setError(null);
    const result = await startSession(athleteId, {
      agentId: read("agentId"),
      environmentId: read("environmentId"),
      vaultIds: vaultId ? [vaultId] : [],
      memoryStoreId: memoryStoreId || null,
      memoryStoreAccess: "read_only"
    });
    setRunning(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`agent-${athleteId}`} className="text-xs">
            Agent
          </Label>
          <select
            id={`agent-${athleteId}`}
            name="agentId"
            className={SELECT_CLASS}
            defaultValue={defaultAgent?.id ?? ""}
          >
            {inventory.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} · v{agent.version}
                {agent.isCoordinator ? " · coordinateur" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <Label htmlFor={`env-${athleteId}`} className="text-xs">
            Environment
          </Label>
          <select
            id={`env-${athleteId}`}
            name="environmentId"
            className={SELECT_CLASS}
            defaultValue={inventory.environments[0]?.id ?? ""}
          >
            {inventory.environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <Label htmlFor={`vault-${athleteId}`} className="text-xs">
            Vault
          </Label>
          <select
            id={`vault-${athleteId}`}
            name="vaultId"
            className={SELECT_CLASS}
            defaultValue={inventory.vaults[0]?.id ?? ""}
          >
            <option value="">Aucun</option>
            {inventory.vaults.map((vault) => (
              <option key={vault.id} value={vault.id}>
                {vault.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <Label htmlFor={`memstore-${athleteId}`} className="text-xs">
            Memory store (lecture seule)
          </Label>
          <select
            id={`memstore-${athleteId}`}
            name="memoryStoreId"
            className={SELECT_CLASS}
            defaultValue={inventory.memoryStores[0]?.id ?? ""}
          >
            <option value="">Aucun</option>
            {inventory.memoryStores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={running || pending}>
          {(running || pending) && <Loader2 className="animate-spin" />}
          Ouvrir la session
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </form>
  );
}
