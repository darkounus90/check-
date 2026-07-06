import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardNav } from "@/app/(dashboard)/dashboard-nav";
import { LogoutButton } from "@/app/(dashboard)/logout-button";
import { navItemsForRole } from "@/app/(dashboard)/nav-config";
import { NotificationProvider } from "@/app/(dashboard)/notifications";
import { getDashboardSession, roleLabel } from "@/lib/auth/session";

/**
 * Layout del route group autenticado (E10-T1). Resuelve la sesión SERVER-SIDE; sin
 * sesión válida redirige a /login (defensa además del middleware). El header muestra
 * nombre del negocio + rol legible + logout, y la navegación se filtra por rol: la
 * navegación de dueño no se renderiza para un cajero.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }

  const items = navItemsForRole(session.role);

  return (
    <NotificationProvider>
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">CHECK</span>
            <span className="hidden text-slate-300 sm:inline">/</span>
            <span className="text-sm text-slate-700">{session.businessName}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {roleLabel(session.role)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <DashboardNav items={items} />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
    </NotificationProvider>
  );
}
