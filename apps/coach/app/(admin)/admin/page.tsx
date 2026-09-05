import type { Athlete } from "@/domain/athlete";
import { getDeps } from "@/deps";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { BrainConfigForm } from "./_components/brain-config-form";
import { NewSessionButton } from "./_components/new-session-button";

// Reads live DB state and secrets, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · Inigo coach" };

const STATUS_VARIANT: Record<Athlete["status"], "default" | "secondary" | "outline"> = {
  active: "default",
  paused: "secondary",
  ended: "outline"
};

export default async function AdminPage() {
  const deps = getDeps();
  const [athletes, template] = await Promise.all([
    deps.repo.listAll(),
    deps.brainConfig.get()
  ]);

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Inigo</h1>
        <p className="text-sm text-muted-foreground">
          Ouvre une session brain et pointe l'athlète dessus. Une session fige la config de
          l'agent à sa création : après un déploiement d'agent, c'est ce bouton qui fait
          basculer le runtime sur la nouvelle version.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Brain</CardTitle>
          <CardDescription>
            Le template dont chaque nouvelle session est construite. Ce sont des identifiants
            du plan de contrôle Anthropic, jamais des secrets : les credentials vivent dans les
            vaults pointés ici.
            {template && (
              <>
                {" "}
                Dernière modification :{" "}
                {template.updatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrainConfigForm template={template} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Athlètes</CardTitle>
          <CardDescription>
            {athletes.length} athlète{athletes.length > 1 ? "s" : ""} en base. La session
            affichée est celle vers laquelle les messages WhatsApp sont routés.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {athletes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun athlète en base.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Athlète</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Session courante</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {athletes.map((athlete) => (
                  <TableRow key={athlete.id}>
                    <TableCell>
                      <div className="font-medium">{athlete.displayName ?? "Sans nom"}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {athlete.phoneNum}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[athlete.status]}>{athlete.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {athlete.anthropicSessionId ? (
                        <span className="font-mono text-xs break-all">
                          {athlete.anthropicSessionId}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Aucune session</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <NewSessionButton
                        athleteId={athlete.id}
                        hasSession={athlete.anthropicSessionId !== null}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
