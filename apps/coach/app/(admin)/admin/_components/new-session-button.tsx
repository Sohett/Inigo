"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Server error codes mapped to something an operator can act on. */
export const ERROR_COPY: Record<string, string> = {
  unauthorized: "Session admin expirée. Recharge la page pour te réidentifier.",
  invalid_athlete_id: "Identifiant d'athlète invalide.",
  invalid_json: "Requête malformée.",
  athlete_not_found: "Cet athlète n'existe plus en base.",
  no_session_to_clone: "Cet athlète n'a pas de session à cloner. Choisis les éléments ci-dessous.",
  invalid_elements: "Éléments invalides.",
  session_start_failed: "Anthropic ou la base a refusé l'opération. Voir les logs du serveur."
};

export interface StartSessionResult {
  ok?: boolean;
  error?: string;
  issues?: string[];
  sessionId?: string;
  agentVersion?: number;
}

/** Shared POST for both entry points: cloning sends no body, a first session sends its elements. */
export async function startSession(
  athleteId: string,
  elements?: unknown
): Promise<{ ok: true; body: StartSessionResult } | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/athletes/${athleteId}/session`, {
      method: "POST",
      ...(elements === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(elements) })
    });
  } catch {
    return { ok: false, message: "Le serveur est injoignable." };
  }

  const body = ((await response.json().catch(() => null)) ?? {}) as StartSessionResult;
  if (!response.ok || !body.ok || !body.sessionId) {
    const code = body.error ?? "session_start_failed";
    const detail = body.issues?.join(" · ");
    return { ok: false, message: detail ?? ERROR_COPY[code] ?? code };
  }
  return { ok: true, body };
}

type State =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "done"; sessionId: string; agentVersion: number }
  | { kind: "error"; message: string };

interface NewSessionButtonProps {
  athleteId: string;
  /** False when the athlete's current session could not be read: cloning would fail. */
  canClone: boolean;
}

/**
 * Re-opens an athlete's session by cloning the one they run today, so the new session
 * picks up the agent's latest version and keeps the same environment, vaults and memory.
 *
 * Replacing a live session drops the conversation history the coach was working from, so
 * the action is deliberately two steps. The confirmation is inline rather than a
 * `window.confirm`, which keeps it testable and non blocking.
 */
export function NewSessionButton({ athleteId, canClone }: NewSessionButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setState({ kind: "idle" });
    const result = await startSession(athleteId);
    setRunning(false);

    if (!result.ok) {
      setState({ kind: "error", message: result.message });
      return;
    }
    setState({
      kind: "done",
      sessionId: result.body.sessionId ?? "",
      agentVersion: result.body.agentVersion ?? 0
    });
    startTransition(() => router.refresh());
  }

  if (state.kind === "confirming") {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Remplacer la session ?</span>
        <Button size="sm" onClick={() => void run()}>
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
        disabled={running || pending || !canClone}
        onClick={() => setState({ kind: "confirming" })}
      >
        {running || pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Nouvelle session
      </Button>

      {!canClone && (
        <p className="text-xs text-muted-foreground">
          Session illisible : rien à cloner.
        </p>
      )}
      {state.kind === "done" && (
        <p className="text-xs text-muted-foreground">
          Créée : <span className="font-mono">{state.sessionId}</span> (agent v{state.agentVersion})
        </p>
      )}
      {state.kind === "error" && <p className="text-xs text-destructive">{state.message}</p>}
    </div>
  );
}
