import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInState } from "@/domain/signedIn";
import { whoIsSignedIn } from "@/identity/sessions";
import { GoogleSignIn } from "./_components/google-sign-in";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion · Admin Inigo",
  robots: { index: false, follow: false }
};

/**
 * The admin's sign in (INI-85): Google only, and only for an invited coach. A coach already
 * signed in goes straight to the admin. Better Auth sends a refused sign in back here with
 * `?error=`.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { error } = await searchParams;
  const signedIn = await whoIsSignedIn(await headers());
  if (signedIn.state === SignInState.Coach) redirect("/admin");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="grid w-full max-w-sm gap-6">
        <p className="text-center text-sm font-semibold tracking-[0.2em] text-muted-foreground uppercase">Inigo</p>
        <section className="grid gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">Admin Inigo</h1>
          <p className="text-sm text-muted-foreground">Réservé aux coachs invités, avec leur compte Google.</p>
          {signedIn.state === SignInState.Unavailable ? (
            <p className="text-sm text-destructive">La connexion n'est pas configurée sur ce serveur.</p>
          ) : (
            <GoogleSignIn />
          )}
          {error !== undefined ? (
            <p className="text-sm text-destructive">
              Connexion refusée. Seul un compte Google invité par un coach peut entrer. Demande une invitation.
            </p>
          ) : null}
          {signedIn.state === SignInState.Athlete ? (
            <p className="text-sm text-muted-foreground">Ce navigateur est connecté comme athlète : l'admin est réservé aux coachs.</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
