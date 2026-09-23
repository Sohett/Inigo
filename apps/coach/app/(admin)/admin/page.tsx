import type { Athlete, AthleteSession } from "@/domain/athlete";
import type { BrainElement, BrainInventory, RunningSession } from "@/domain/brain";
import { getDeps } from "@/deps";
import { createLoadAdminOverview } from "@/use-cases/loadAdminOverview";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FirstSessionForm } from "./_components/first-session-form";
import { NewSessionButton } from "./_components/new-session-button";
import { WhatsappSessionForm } from "./_components/whatsapp-session-form";

// Reads live DB and control-plane state, so it must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · Inigo coach" };

const STATUS_VARIANT: Record<Athlete["status"], "default" | "secondary" | "outline"> = {
  active: "default",
  paused: "secondary",
  ended: "outline"
};

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
      <dd className="font-mono break-all">{session.sessionId}</dd>

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

const DATE_FORMAT = new Intl.DateTimeFormat("fr-BE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Brussels"
});

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
            <span className="font-mono break-all">{session.sessionId}</span>
            <span className="text-muted-foreground">
              {DATE_FORMAT.format(session.startedAt)} → {session.endedAt && DATE_FORMAT.format(session.endedAt)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function AdminPage() {
  const deps = getDeps();
  const overview = await createLoadAdminOverview({
    repo: deps.repo,
    brain: deps.brain,
    gateway: deps.whatsappGateway
  }).execute();

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-4 py-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Inigo</h1>
        <p className="text-sm text-muted-foreground">
          Une session fige la config de l'agent à sa création. Après un déploiement qui bump
          une version d'agent, c'est l'ouverture d'une session fraîche qui fait basculer le
          runtime. Le bouton recrée la session de l'athlète à l'identique, en repointant
          l'agent sur sa dernière version. L'ancienne session reste dans l'historique. La
          config des sessions est lue en direct chez Anthropic, seuls leurs ids sont gardés
          en base.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Passerelle WhatsApp</CardTitle>
          <CardDescription>
            La voix du coach. Tout le reste peut marcher sans que l'athlète reçoive quoi que ce
            soit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.whatsappSessionError ? (
            <p className="text-sm text-destructive">
              Session illisible en base : {overview.whatsappSessionError}
            </p>
          ) : (
            <WhatsappSessionForm current={overview.whatsappSessionId} />
          )}
        </CardContent>
      </Card>

      {overview.athletes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun athlète en base.</p>
      ) : (
        overview.athletes.map(({ athlete, session, sessionError, pastSessions }) => (
          <Card key={athlete.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {athlete.displayName ?? "Sans nom"}
                <Badge variant={STATUS_VARIANT[athlete.status]}>{athlete.status}</Badge>
              </CardTitle>
              <CardDescription className="font-mono text-xs">{athlete.phoneNum}</CardDescription>
            </CardHeader>

            <CardContent className="grid gap-4">
              {session && <SessionSummary session={session} inventory={overview.inventory} />}

              {sessionError && (
                <div className="grid gap-1 text-xs">
                  <p className="text-destructive">
                    La session <span className="font-mono">{athlete.anthropicSessionId}</span> est
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
                    inventory={overview.inventory}
                    inventoryError={overview.inventoryError}
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
        ))
      )}
    </main>
  );
}
