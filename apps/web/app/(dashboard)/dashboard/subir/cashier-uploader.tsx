"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { refetchTransactionsAction } from "@/app/(dashboard)/actions";
import { useNotifications } from "@/app/(dashboard)/notifications";
import { EmptyState, ErrorState } from "@/components/ui/state-views";
import { VERDICT_META, VerdictBadge } from "@/components/ui/verdict-badge";
import type { DashboardTransaction } from "@/lib/data/transaction-types";
import { formatCents, formatDateTime } from "@/lib/format";
import { useRealtimeTransactions } from "@/lib/realtime/use-realtime-transactions";
import type { VerdictStatus } from "@/lib/supabase/types";

import { UploadVoucher } from "./upload-voucher";

/**
 * Vista del cajero (E10-T3 subir + E10-T4 estado en vivo + E10-T5 notificación), unida en
 * un solo client component para que la subida dispare el refetch del estado en vivo sin
 * recargar. Fuente de verdad de los datos: `refetchTransactionsAction` (apiFetch). Realtime
 * es sólo señal; hay polling de respaldo mientras haya pendientes.
 */

const POLL_INTERVAL_MS = 5000;

function detectResolved(
  prev: Map<string, VerdictStatus>,
  next: DashboardTransaction[],
): DashboardTransaction[] {
  const resolved: DashboardTransaction[] = [];
  for (const tx of next) {
    const before = prev.get(tx.id);
    if (before === "PENDING" && (tx.verdict === "VERIFIED" || tx.verdict === "SUSPICIOUS")) {
      resolved.push(tx);
    }
  }
  return resolved;
}

export function CashierUploader({
  businessId,
  initialTransactions,
  initialError = false,
}: {
  businessId: string;
  initialTransactions: DashboardTransaction[];
  initialError?: boolean;
}) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [error, setError] = useState(initialError);
  const { notify } = useNotifications();

  const verdictsRef = useRef<Map<string, VerdictStatus>>(
    new Map(initialTransactions.map((tx) => [tx.id, tx.verdict])),
  );

  const refresh = useCallback(async () => {
    const result = await refetchTransactionsAction();
    if (!result.ok || !result.data) {
      setError(true);
      return;
    }
    setError(false);
    const resolved = detectResolved(verdictsRef.current, result.data);
    verdictsRef.current = new Map(result.data.map((tx) => [tx.id, tx.verdict]));
    for (const tx of resolved) {
      if (tx.verdict === "VERIFIED") {
        notify({
          tone: "success",
          title: "🟢 Pago verificado — puedes entregar",
          description: `${formatCents(tx.amountCents)} confirmado.`,
        });
      } else {
        notify({
          tone: "danger",
          title: "🚨 No entregues — no pudimos verificar",
          description: `Revisa el pago de ${formatCents(tx.amountCents)} antes de entregar.`,
        });
      }
    }
    setTransactions(result.data);
  }, [notify]);

  useRealtimeTransactions({
    businessId,
    enabled: Boolean(businessId),
    onChange: () => {
      void refresh();
    },
  });

  const hasPending = transactions.some((tx) => tx.verdict === "PENDING");
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending, refresh]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Nuevo comprobante
        </h2>
        <UploadVoucher onUploaded={() => void refresh()} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Verificaciones en vivo
        </h2>
        {error && transactions.length === 0 ? (
          <ErrorState description="No pudimos cargar el estado de tus comprobantes." />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="Aún no hay comprobantes"
            description="Cuando llegue uno, verás aquí su verificación en vivo."
          />
        ) : (
          <ul className="flex flex-col gap-2" aria-live="polite">
            {transactions.map((tx) => {
              const meta = VERDICT_META[tx.verdict];
              return (
                <li
                  key={tx.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        tx.verdict === "PENDING" ? "text-2xl motion-safe:animate-pulse" : "text-2xl"
                      }
                      aria-hidden="true"
                    >
                      {meta.emoji}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {formatCents(tx.amountCents)}
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(tx.createdAt)}</p>
                    </div>
                  </div>
                  <VerdictBadge verdict={tx.verdict} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
