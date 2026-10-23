"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, ShieldCheck, Users } from "lucide-react";
import { authClient } from "@/identity/authClient";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar";

const ITEMS = [
  { href: "/admin/athletes", label: "Athlètes", icon: Users },
  { href: "/admin/coaches", label: "Coachs", icon: ShieldCheck },
  { href: "/admin/settings", label: "Réglages", icon: Settings }
] as const;

export function AdminSidebar({ coach }: { coach: { email: string; name: string | null } }) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/login");
  };

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3 text-sm font-semibold">Admin Inigo</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={pathname === href || pathname.startsWith(`${href}/`)}
                    render={<Link href={href} />}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <p className="truncate px-2 text-xs text-muted-foreground" title={coach.email}>
              {coach.name ?? coach.email}
            </p>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOut />
              <span>Se déconnecter</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
