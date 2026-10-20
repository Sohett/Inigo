import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { AthleteSession } from "@/domain/athlete";
import type { BrainElement, BrainInventory, RunningSession } from "@/domain/brain";
import { getDeps } from "@/deps";
import { createLoadAthleteSessions } from "@/use-cases/loadAthleteSessions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { contactOf, DATE_TIME_FORMAT, STATUS_LABEL, STATUS_VARIANT } from "../../_components/labels";
import { SessionLink } from "../../_components/session-link";
import { FirstSessionForm } from "./_components/first-session-form";
import { NewSessionButton } from "./_components/new-session-button";

// Reads live DB and control-plane state, so it must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Athlète · Admin Inigo" };

/** Show a control-plane id by its name when we know it, else the raw id. */
function label(elements: BrainElement[] | undefined, id: string): string {
  return elements?.find((element) => element.id === id)?.name ?? id;
}

function SessionSummary({
  session,
  inventory
}: {
  session: RunningSession;
  inventory: BrainInventory | null;
}) {
  const memoryStores = session.resources.filter((resource) => resource.kind === "memory_store");
  return (
    <dl className="grid gap-1 text-xs sm:grid-cols-[7rem_1fr]">
      <dt className="text-muted-foreground">Session</dt>
      <dd>
        <SessionLink sessionId={session.sessionId} />
      </dd>

      <dt className="text-muted-foreground">Tourne sur</dt>
      <dd>
        {session.agentName} · v{session.agentVersion}
      </dd>

      <dt className="text-muted-foreground">Environment</dt>
      <dd>{label(inventory?.environments, session.environmentId)}</dd>

      <dt className="text-muted-foreground">Vaults</dt>
      <dd>
        {session.vaultIds.length === 0
          ? "aucun"
          : session.vaultIds.map((id) => label(inventory?.vaults, id)).join(", ")}
      </dd>

      <dt className="text-muted-foreground">Memory</dt>
      <dd>
        {memoryStores.length === 0
          ? "aucun"
          : memoryStores
              .map(
                (resource) =>
                  `${label(inventory?.memoryStores, resource.memoryStoreId)} (${resource.access})`
              )
              .join(", ")}
      </dd>
    </dl>
  );
}

/** Sessions a newer one replaced. Kept so the history stays traceable at Anthropic. */
function PastSessions({ sessions }: { sessions: AthleteSession[] }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        Sessions précédentes ({sessions.length})
      </summary>
      <ul className="mt-2 grid gap-1">
        {sessions.map((session) => (
          <li key={session.sessionId} className="grid gap-x-3 sm:grid-cols-[1fr_auto]">
            <SessionLink sessionId={session.sessionId} />
            <span className="text-muted-foreground">
              {DATE_TIME_FORMAT.format(session.startedAt)} →{" "}
              {session.endedAt && DATE_TIME_FORMAT.format(session.endedAt)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function AthletePage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  // Not a uuid can't be an athlete: answer 404 rather than let Postgres reject the cast.
  if (!z.uuid().safeParse(athleteId).success) notFound();

  const deps = getDeps();
  const detail = await createLoadAthleteSessions({ repo: deps.repo, brain: deps.brain }).execute(
    athleteId
  );
  if (!detail) notFound();
  const { athlete, session, sessionError, pastSessions, inventory, inventoryError } = detail;

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-8">
      <header className="grid gap-1">
        <Link href="/admin/athletes" className="text-xs text-muted-foreground hover:underline">
          ← Athlètes
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {athlete.displayName ?? "Sans nom"}
          <Badge variant={STATUS_VARIANT[athlete.status]}>{STATUS_LABEL[athlete.status]}</Badge>
        </h1>
        <p className="font-mono text-xs text-muted-foreground">{contactOf(athlete)}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Session agent</CardTitle>
          <CardDescription>
            Une session fige la config de l'agent à sa création. Après un déploiement qui bump
            une version d'agent, c'est l'ouverture d'une session fraîche qui fait basculer le
            runtime. Le bouton recrée la session de l'athlète à l'identique, en repointant
            l'agent sur sa dernière version. L'ancienne session reste dans l'historique. La
            config des sessions est lue en direct chez Anthropic, seuls leurs ids sont gardés
            en base.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {session && <SessionSummary session={session} inventory={inventory} />}

          {sessionError && (
            <div className="grid gap-1 text-xs">
              <p className="text-destructive">
                La session{" "}
                {athlete.activeSession && <SessionLink sessionId={athlete.activeSession.sessionId} />} est
                illisible chez Anthropic.
              </p>
              <p className="text-muted-foreground">{sessionError}</p>
            </div>
          )}

          {!session && !sessionError && (
            <div className="grid gap-3">
              <p className="text-xs text-muted-foreground">
                Aucune session. Choisis de quoi ouvrir la première, listé en direct depuis
                Anthropic.
              </p>
              <FirstSessionForm
                athleteId={athlete.id}
                inventory={inventory}
                inventoryError={inventoryError}
              />
            </div>
          )}

          {pastSessions.length > 0 && <PastSessions sessions={pastSessions} />}

          {(session ?? sessionError) && (
            <div className="flex justify-end">
              <NewSessionButton athleteId={athlete.id} canClone={session !== null} />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
