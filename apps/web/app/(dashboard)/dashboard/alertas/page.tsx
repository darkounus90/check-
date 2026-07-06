import { redirect } from "next/navigation";

import { defaultRouteForRole, getDashboardSession } from "@/lib/auth/session";
import { type DashboardTransaction, listTransactions } from "@/lib/data/transactions";

import { AlertsView } from "./alerts-view";

/**
 * Panel de alertas de fraude (solo dueño) — E10-T7. Destaca los 🚨 del negocio.
 * Protegido por rol: un cajero por URL directa es enviado a su vista por defecto.
 */
export default async function AlertasPage() {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "OWNER") {
    redirect(defaultRouteForRole(session.role));
  }

  let transactions: DashboardTransaction[] = [];
  let loadError = false;
  try {
    transactions = await listTransactions();
  } catch {
    loadError = true;
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
        <p className="mt-1 text-sm text-slate-600">
          Intentos sospechosos y patrones de fraude en tu negocio.
        </p>
      </div>
      <AlertsView transactions={transactions} loadError={loadError} />
    </section>
  );
}
