import { redirect } from "next/navigation";

import { ComingSoon } from "@/app/(dashboard)/coming-soon";
import { defaultRouteForRole, getDashboardSession } from "@/lib/auth/session";

/**
 * Vista "Histórico" (solo dueño). Contenido real en E10-T6. Placeholder.
 * Un cajero que llegue por URL directa es enviado a su vista por defecto.
 */
export default async function HistoricoPage() {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "OWNER") {
    redirect(defaultRouteForRole(session.role));
  }

  return (
    <ComingSoon
      title="Histórico"
      description="Aquí verás el histórico de transacciones de tu negocio con filtros y alertas."
    />
  );
}
