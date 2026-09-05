"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrainSessionTemplate } from "@/domain/brain";

type State =
  | { kind: "idle" }
  | { kind: "saved" }
  | { kind: "error"; messages: string[] };

interface BrainConfigFormProps {
  /** The stored template, or null when the brain has never been configured. */
  template: BrainSessionTemplate | null;
}

const FIELD_CLASS = "font-mono text-xs";

/**
 * Edit the template every new session is built from.
 *
 * These ids live in the database rather than in env precisely so they can be changed
 * here, without a redeploy, when the brain moves to another agent or environment.
 */
export function BrainConfigForm({ template }: BrainConfigFormProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (name: string) => String(form.get(name) ?? "").trim();
    const memoryStoreId = read("memoryStoreId");

    const body = {
      coordinatorAgentId: read("coordinatorAgentId"),
      environmentId: read("environmentId"),
      // One vault per line in the textarea, blanks dropped.
      vaultIds: read("vaultIds")
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      memoryStoreId: memoryStoreId.length > 0 ? memoryStoreId : null,
      memoryStoreAccess: read("memoryStoreAccess") || "read_only"
    };

    setSaving(true);
    setState({ kind: "idle" });
    try {
      const response = await fetch("/api/admin/brain-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; issues?: string[] }
        | null;

      if (!response.ok || !payload?.ok) {
        setState({
          kind: "error",
          messages: payload?.issues ?? [payload?.error ?? "Échec de l'enregistrement."]
        });
        return;
      }
      setState({ kind: "saved" });
      startTransition(() => router.refresh());
    } catch {
      setState({ kind: "error", messages: ["Le serveur est injoignable."] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="coordinatorAgentId">Agent coordinateur</Label>
          <Input
            id="coordinatorAgentId"
            name="coordinatorAgentId"
            className={FIELD_CLASS}
            defaultValue={template?.coordinatorAgentId ?? ""}
            placeholder="agent_…"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="environmentId">Environment</Label>
          <Input
            id="environmentId"
            name="environmentId"
            className={FIELD_CLASS}
            defaultValue={template?.environmentId ?? ""}
            placeholder="env_…"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="memoryStoreId">Memory store (optionnel)</Label>
          <Input
            id="memoryStoreId"
            name="memoryStoreId"
            className={FIELD_CLASS}
            defaultValue={template?.memoryStoreId ?? ""}
            placeholder="memstore_…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="memoryStoreAccess">Accès mémoire</Label>
          <select
            id="memoryStoreAccess"
            name="memoryStoreAccess"
            defaultValue={template?.memoryStoreAccess ?? "read_only"}
            className="h-8 rounded-lg border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="read_only">read_only</option>
            <option value="read_write">read_write</option>
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="vaultIds">Vaults (un par ligne)</Label>
        <textarea
          id="vaultIds"
          name="vaultIds"
          rows={2}
          defaultValue={(template?.vaultIds ?? []).join("\n")}
          placeholder="vlt_…"
          className="rounded-lg border border-input bg-background p-2 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={saving || pending}>
          {(saving || pending) && <Loader2 className="animate-spin" />}
          Enregistrer
        </Button>
        {state.kind === "saved" && (
          <span className="text-xs text-muted-foreground">Template enregistré.</span>
        )}
      </div>

      {state.kind === "error" && (
        <ul className="text-xs text-destructive">
          {state.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
