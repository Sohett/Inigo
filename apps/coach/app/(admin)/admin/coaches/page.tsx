import { headers } from "next/headers";
import { getDeps } from "@/deps";
import { CoachStatus } from "@/domain/coach";
import { SignInState } from "@/domain/signedIn";
import { whoIsSignedIn } from "@/identity/sessions";
import { createListCoaches } from "@/use-cases/listCoaches";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InviteCoachForm } from "./_components/invite-coach-form";
import { RemoveCoachButton } from "./_components/remove-coach-button";

// Reads the live team, so it must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Coachs · Admin Inigo" };

const DATE = new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeZone: "Europe/Brussels" });

/**
 * The coaches who can open the admin (INI-85): invitation only, Google sign in. No rights per
 * coach yet: every coach sees everything, and can invite or remove another one (never themselves).
 */
export default async function CoachesPage() {
  const [coaches, signedIn] = await Promise.all([
    createListCoaches({ coaches: getDeps().coaches }).execute(),
    whoIsSignedIn(await headers())
  ]);
  const me = signedIn.state === SignInState.Coach ? signedIn.email : null;

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Coachs</h1>

      <Card>
        <CardHeader>
          <CardTitle>Inviter un coach</CardTitle>
          <CardDescription>
            L'admin est réservé aux coachs invités. Invite l'adresse de son compte Google et partage le lien de
            connexion : le coach entre la première fois qu'il se connecte avec ce compte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteCoachForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Équipe</CardTitle>
          <CardDescription>Retirer un coach ferme ses sessions tout de suite, et il ne peut plus se reconnecter.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Invité le</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {coaches.map((coach) => (
                <TableRow key={coach.email}>
                  <TableCell>
                    <div className="grid">
                      <span>{coach.name ?? coach.email}</span>
                      {coach.name ? <span className="text-xs text-muted-foreground">{coach.email}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {coach.status === CoachStatus.Active ? (
                      <Badge>Actif</Badge>
                    ) : (
                      <Badge variant="outline">Invité</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{DATE.format(coach.invitedAt)}</TableCell>
                  <TableCell className="text-right">
                    {coach.email === me ? (
                      <span className="text-xs text-muted-foreground">Toi</span>
                    ) : (
                      <RemoveCoachButton email={coach.email} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
