import { getDeps } from "@/deps";
import { createListAdminAthletes } from "@/use-cases/listAdminAthletes";
import { AthletesTable } from "./_components/athletes-table";

// Reads live DB state, so it must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Athlètes · Admin Inigo" };

export default async function AthletesPage() {
  const rows = await createListAdminAthletes({ roster: getDeps().athleteRoster }).execute();

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Athlètes</h1>
      <AthletesTable rows={rows} />
    </main>
  );
}
