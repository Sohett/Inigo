import { headers } from "next/headers";
import { StaffRole, StaffStatus } from "@/domain/staff";
import { SignInState } from "@/domain/signedIn";
import { staffOnDeployment } from "@/identity/accounts";
import { whoIsSignedIn } from "@/identity/sessions";
import { createListStaff } from "@/use-cases/listStaff";
import { settle } from "@/use-cases/settle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InviteStaffForm } from "./_components/invite-staff-form";
import { RemoveStaffButton } from "./_components/remove-staff-button";

// Reads the live team, so it must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Équipe · Admin Inigo" };

const DATE = new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeZone: "Europe/Brussels" });

const ROLE_LABEL: Record<StaffRole, string> = {
  [StaffRole.Admin]: "Admin",
  [StaffRole.Coach]: "Coach"
};

/**
 * The backoffice team (INI-85, INI-87): invitation only, Google sign in. Inviting someone creates
 * their user; they become active on their first Google sign in. Roles say who does what (admin,
 * coach, or both) but grant nothing more yet: every member can invite or remove another one
 * (never themselves).
 */
export default async function TeamPage() {
  const requestHeaders = await headers();
  const team = staffOnDeployment(requestHeaders);
  const [members, signedIn] = await Promise.all([
    settle(team ? createListStaff({ staff: team }).execute() : Promise.resolve([])),
    whoIsSignedIn(requestHeaders)
  ]);
  const me = signedIn.state === SignInState.Staff ? signedIn.email : null;

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>

      <Card>
        <CardHeader>
          <CardTitle>Inviter un membre</CardTitle>
          <CardDescription>
            L'admin est réservé à l'équipe, sur invitation. Invite l'adresse de son compte Google, choisis son rôle,
            puis copie le lien de connexion pour la personne : elle entre en se connectant avec ce compte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteStaffForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membres</CardTitle>
          <CardDescription>
            Les rôles disent qui fait quoi, ils ne limitent encore rien. Retirer un membre ferme ses sessions tout de
            suite, et il ne peut plus se reconnecter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.error ? (
            <p className="text-sm text-destructive">Équipe illisible : {members.error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membre</TableHead>
                  <TableHead>Rôles</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Invité le</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(members.value ?? []).map((member) => (
                  <TableRow key={member.email}>
                    <TableCell>
                      <div className="grid">
                        <span>{member.name ?? member.email}</span>
                        {member.name ? <span className="text-xs text-muted-foreground">{member.email}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {member.roles.map((role) => (
                          <Badge key={role} variant="secondary">
                            {ROLE_LABEL[role]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.status === StaffStatus.Active ? <Badge>Actif</Badge> : <Badge variant="outline">Invité</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{DATE.format(member.invitedAt)}</TableCell>
                    <TableCell className="text-right">
                      {member.email === me ? (
                        <span className="text-xs text-muted-foreground">Toi</span>
                      ) : (
                        <RemoveStaffButton email={member.email} />
                      )}
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
