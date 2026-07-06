import { redirect } from "next/navigation";

import { defaultRouteForRole, getDashboardSession } from "@/lib/auth/session";

/** Raíz del dashboard: redirige a la vista por defecto del rol del usuario. */
export default async function DashboardIndexPage() {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }
  redirect(defaultRouteForRole(session.role));
}
