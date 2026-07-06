"use client";

import { useMemo } from "react";

import { EmptyState, ErrorState } from "@/components/ui/state-views";
import type { DashboardTransaction } from "@/lib/data/transaction-types";
import { formatCents, formatDateTime } from "@/lib/format";

/**
 * Panel de intentos sospechosos / alertas de fraude (E10-T7). Destaca los 🚨 y resalta
 * patrones simples (varios sospechosos con el mismo Nº de aprobación = posible reuso de
 * comprobante). Los datos vienen server-side vía apiFetch; aquí sólo se agrupan/presentan.
 */

interface SuspiciousPattern {
  approvalNumber: string;
  count: number;
  totalCents: number;
}

function detectPatterns(suspicious: DashboardTransaction[]): SuspiciousPattern[] {
  const byApproval = new Map<string, DashboardTransaction[]>();
  for (const tx of suspicious) {
    if (!tx.approvalNumber) continue;
    const list = byApproval.get(tx.approvalNumber) ?? [];
    list.push(tx);
    byApproval.set(tx.approvalNumber, list);
  }
  return [...byApproval.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([approvalNumber, list]) => ({
      approvalNumber,
      count: list.length,
      totalCents: list.reduce((sum, tx) => sum + tx.amountCents, 0),
    }))
    .sort((a, b) => b.count - a.count);
}

export function AlertsView({
  transactions,
  loadError = false,
}: {
  transactions: DashboardTransaction[];
  loadError?: boolean;
}) {
  const suspicious = useMemo(
    () =>
      transactions
        .filter((tx) => tx.verdict === "SUSPICIOUS")
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [transactions],
  );
  const patterns = useMemo(() => detectPatterns(suspicious), [suspicious]);

  if (loadError && transactions.length === 0) {
    return <ErrorState description="No pudimos cargar las alertas. Intenta de nuevo." />;
  }

  if (suspicious.length === 0) {
    return (
      <EmptyState
        icon="✅"
        title="Sin intentos sospechosos"
        description="No hay comprobantes marcados como sospechosos en tu negocio."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-red-600">
            Intentos sospechosos
          </p>
          <p className="mt-1 text-2xl font-semibold text-red-700">{suspicious.length}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-red-600">
            Monto en riesgo
          </p>
          <p className="mt-1 text-2xl font-semibold text-red-700">
            {formatCents(suspicious.reduce((sum, tx) => sum + tx.amountCents, 0))}
          </p>
        </div>
      </div>

      {patterns.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            Patrones detectados
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-700">
            {patterns.map((pattern) => (
              <li key={pattern.approvalNumber}>
                Nº de aprobación <span className="font-medium">{pattern.approvalNumber}</span>{" "}
                aparece en {pattern.count} comprobantes sospechosos (posible reuso).
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {suspicious.map((tx) => (
          <li
            key={tx.id}
            className="flex flex-col gap-2 rounded-lg border border-red-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">
                🚨
              </span>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {formatCents(tx.amountCents)}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(tx.createdAt)}
                  {tx.approvalNumber ? ` · Nº ${tx.approvalNumber}` : ""}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
              No verificado
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
