import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SignInState } from "@/domain/signedIn";
import { whoIsSignedIn } from "@/identity/sessions";
import { AdminSidebar } from "./_components/admin-sidebar";

export const metadata = { title: "Admin · Inigo coach" };

// The session is read on every request: never prerendered.
export const dynamic = "force-dynamic";

/**
 * Every admin page is for a signed in coach (INI-85). `proxy.ts` only checked that a session
 * cookie exists; whose it is is checked here, so an athlete's session never sees the admin.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const signedIn = await whoIsSignedIn(await headers());
  if (signedIn.state !== SignInState.Coach) redirect("/login");

  return (
    <SidebarProvider>
      <AdminSidebar coach={{ email: signedIn.email, name: signedIn.name }} />
      <SidebarInset>
        <header className="flex h-12 items-center border-b px-4">
          <SidebarTrigger />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
