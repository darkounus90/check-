import { redirect } from "next/navigation";

import { getDashboardSession } from "@/lib/auth/session";
import { type DashboardTransaction, listTransactions } from "@/lib/data/transactions";
import { getCashierUploadLink } from "@/lib/data/voucher-link";

import { CashierUploader } from "./cashier-uploader";

/**
 * Vista "Subir comprobante" (cajero y dueño) — E10-T3/T4/T5.
 * Sube el comprobante, muestra el estado en vivo (semáforo) y notifica al resolverse.
 * Los datos iniciales se cargan server-side (apiFetch, aislado por negocio); el resto
 * (subida + refetch en vivo + notificaciones) ocurre en el client component.
 */
export default async function SubirPage() {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }

  const { opaqueId } = await getCashierUploadLink();

  let initialTransactions: DashboardTransaction[];
  let initialError = false;
  try {
    initialTransactions = await listTransactions();
  } catch {
    initialTransactions = [];
    initialError = true;
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subir comprobante</h1>
        <p className="mt-1 text-sm text-slate-600">
          Sube el comprobante de pago y mira su verificación en vivo.
        </p>
      </div>
      <CashierUploader
        businessId={session.businessId}
        opaqueId={opaqueId}
        initialTransactions={initialTransactions}
        initialError={initialError}
      />
    </section>
  );
}
