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
 * Every admin page is for a signed in staff member (INI-85). `proxy.ts` already let only staff
 * through; checked again here, so the admin never rests on the proxy alone.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const signedIn = await whoIsSignedIn(await headers());
  if (signedIn.state !== SignInState.Staff) redirect("/login");

  return (
    <SidebarProvider>
      <AdminSidebar member={{ email: signedIn.email, name: signedIn.name }} />
      <SidebarInset>
        <header className="flex h-12 items-center border-b px-4">
          <SidebarTrigger />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
