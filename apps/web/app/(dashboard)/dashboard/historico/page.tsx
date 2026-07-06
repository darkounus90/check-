import { redirect } from "next/navigation";

import { defaultRouteForRole, getDashboardSession } from "@/lib/auth/session";
import { getReceivingAccounts, type ReceivingAccount } from "@/lib/data/accounts";
import { type DashboardTransaction, listTransactions } from "@/lib/data/transactions";

import { HistoryView } from "./history-view";

/**
 * Vista "Histórico" (solo dueño) — E10-T6. Lista y filtra las transacciones del negocio.
 * Un cajero que llegue por URL directa es enviado a su vista por defecto (defensa además
 * de la nav filtrada por rol).
 */
export default async function HistoricoPage() {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "OWNER") {
    redirect(defaultRouteForRole(session.role));
  }

  let transactions: DashboardTransaction[] = [];
  let accounts: ReceivingAccount[] = [];
  let loadError = false;
  try {
    [transactions, accounts] = await Promise.all([
      listTransactions(),
      getReceivingAccounts().catch(() => []),
    ]);
  } catch {
    loadError = true;
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
        <p className="mt-1 text-sm text-slate-600">
          Todas las verificaciones de tu negocio, con filtros por estado, fecha y cuenta.
        </p>
      </div>
      <HistoryView transactions={transactions} accounts={accounts} loadError={loadError} />
    </section>
  );
}
