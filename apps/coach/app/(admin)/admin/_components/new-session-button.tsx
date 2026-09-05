"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Server error codes mapped to something an operator can act on. */
const ERROR_COPY: Record<string, string> = {
  unauthorized: "Session admin expirée. Recharge la page pour te réidentifier.",
  invalid_athlete_id: "Identifiant d'athlète invalide.",
  athlete_not_found: "Cet athlète n'existe plus en base.",
  brain_not_configured: "Le brain n'est pas configuré : renseigne le template ci-dessus.",
  session_start_failed: "Anthropic ou la base a refusé l'opération. Voir les logs du serveur."
};

type State =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "done"; sessionId: string; agentVersion: number }
  | { kind: "error"; message: string };

interface NewSessionButtonProps {
  athleteId: string;
  /** Whether the athlete already has a session, which the new one replaces. */
  hasSession: boolean;
}

/**
 * Opens a fresh brain session for one athlete and re-points their row at it.
 *
 * Replacing a live session drops the conversation history the coach was working from,
 * so the action is deliberately two steps rather than one click. The confirmation is
 * inline instead of a `window.confirm`, which keeps it testable and non blocking.
 */
export function NewSessionButton({ athleteId, hasSession }: NewSessionButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  async function start() {
    setState({ kind: "idle" });
    let response: Response;
    try {
      response = await fetch(`/api/admin/athletes/${athleteId}/session`, { method: "POST" });
    } catch {
      setState({ kind: "error", message: "Le serveur est injoignable." });
      return;
    }

    const body: unknown = await response.json().catch(() => null);
    const payload = body as { ok?: boolean; error?: string; sessionId?: string; agentVersion?: number } | null;

    if (!response.ok || !payload?.ok || !payload.sessionId) {
      const code = payload?.error ?? "session_start_failed";
      setState({ kind: "error", message: ERROR_COPY[code] ?? code });
      return;
    }

    setState({ kind: "done", sessionId: payload.sessionId, agentVersion: payload.agentVersion ?? 0 });
    startTransition(() => router.refresh());
  }

  if (state.kind === "confirming") {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Remplacer la session ?</span>
        <Button size="sm" onClick={() => void start()}>
          Oui
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setState({ kind: "idle" })}>
          Non
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => (hasSession ? setState({ kind: "confirming" }) : void start())}
      >
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Nouvelle session
      </Button>

      {state.kind === "done" && (
        <p className="text-xs text-muted-foreground">
          Créée : <span className="font-mono">{state.sessionId}</span> (agent v{state.agentVersion})
        </p>
      )}
      {state.kind === "error" && <p className="text-xs text-destructive">{state.message}</p>}
    </div>
  );
}
