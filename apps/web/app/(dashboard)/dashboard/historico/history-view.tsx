"use client";

import { useMemo, useState } from "react";

import { EmptyState, ErrorState } from "@/components/ui/state-views";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import type { ReceivingAccount } from "@/lib/data/accounts";
import {
  applyTransactionFilters,
  type DashboardTransaction,
  type TransactionFilters,
} from "@/lib/data/transaction-types";
import { formatCents, formatDateTime } from "@/lib/format";
import type { VerdictStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/**
 * Histórico de transacciones del dueño con filtros por estado/fecha/cuenta (E10-T6).
 *
 * Los filtros se aplican EN CLIENTE sobre el listado ya cargado (no hay endpoint de
 * filtro server-side en apps/api; ver lib/data/transactions.ts). Cuando el backend exponga
 * filtros, sólo cambia la carga de datos; esta UI se mantiene.
 */

const VERDICT_OPTIONS: { value: VerdictStatus; label: string }[] = [
  { value: "VERIFIED", label: "🟢 Verificado" },
  { value: "PENDING", label: "🟡 Pendiente" },
  { value: "SUSPICIOUS", label: "🚨 Sospechoso" },
];

export function HistoryView({
  transactions,
  accounts,
  loadError = false,
}: {
  transactions: DashboardTransaction[];
  accounts: ReceivingAccount[];
  loadError?: boolean;
}) {
  const [verdicts, setVerdicts] = useState<VerdictStatus[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [accountId, setAccountId] = useState("");

  const filtered = useMemo(() => {
    const filters: TransactionFilters = {
      verdicts: verdicts.length > 0 ? verdicts : undefined,
      from: from ? new Date(from).toISOString() : undefined,
      // Fin de día para incluir toda la fecha "hasta".
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      accountId: accountId || undefined,
    };
    return applyTransactionFilters(transactions, filters);
  }, [transactions, verdicts, from, to, accountId]);

  function toggleVerdict(value: VerdictStatus) {
    setVerdicts((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  }

  function clearFilters() {
    setVerdicts([]);
    setFrom("");
    setTo("");
    setAccountId("");
  }

  const hasActiveFilters =
    verdicts.length > 0 || Boolean(from) || Boolean(to) || Boolean(accountId);

  if (loadError && transactions.length === 0) {
    return <ErrorState description="No pudimos cargar el histórico. Intenta de nuevo." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {VERDICT_OPTIONS.map((option) => {
            const active = verdicts.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleVerdict(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 text-slate-600 hover:bg-slate-100",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Desde
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
            Cuenta receptora
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="">Todas las cuentas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.alias || account.bank} · {account.accountNumber}
                </option>
              ))}
            </select>
          </label>
        </div>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="self-start text-xs font-medium text-slate-500 underline hover:text-slate-900"
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">
        {filtered.length}{" "}
        {filtered.length === 1 ? "transacción" : "transacciones"}
        {hasActiveFilters ? " (filtradas)" : ""}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={
            hasActiveFilters
              ? "Ninguna transacción coincide con los filtros"
              : "Aún no hay transacciones"
          }
          description={
            hasActiveFilters
              ? "Ajusta o limpia los filtros para ver más resultados."
              : "Cuando lleguen comprobantes, aparecerán aquí."
          }
        />
      ) : (
        <TransactionTable transactions={filtered} accounts={accounts} />
      )}
    </div>
  );
}

function TransactionTable({
  transactions,
  accounts,
}: {
  transactions: DashboardTransaction[];
  accounts: ReceivingAccount[];
}) {
  const accountLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(account.id, account.alias || `${account.bank} · ${account.accountNumber}`);
    }
    return map;
  }, [accounts]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      {/* Tabla en pantallas anchas; tarjetas apiladas en móvil (responsive, E10-T9). */}
      <table className="hidden w-full text-left text-sm sm:table">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Monto</th>
            <th className="px-4 py-3 font-medium">Nº aprobación</th>
            <th className="px-4 py-3 font-medium">Cuenta</th>
            <th className="px-4 py-3 font-medium">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {transactions.map((tx) => (
            <tr key={tx.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <VerdictBadge verdict={tx.verdict} />
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {formatCents(tx.amountCents)}
              </td>
              <td className="px-4 py-3 text-slate-600">{tx.approvalNumber ?? "—"}</td>
              <td className="px-4 py-3 text-slate-600">
                {tx.accountId ? (accountLabel.get(tx.accountId) ?? "—") : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">{formatDateTime(tx.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-slate-100 sm:hidden">
        {transactions.map((tx) => (
          <li key={tx.id} className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">{formatCents(tx.amountCents)}</span>
              <VerdictBadge verdict={tx.verdict} />
            </div>
            <p className="text-xs text-slate-500">{formatDateTime(tx.createdAt)}</p>
            <p className="text-xs text-slate-500">
              Nº aprobación: {tx.approvalNumber ?? "—"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
