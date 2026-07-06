import type { VerdictStatus } from "@/lib/supabase/types";

/**
 * Tipos y helpers PUROS de transacciones, seguros de importar tanto en Server como en
 * Client Components (sin `server-only`, sin acceso a red). La carga de datos vive en
 * `transactions.ts` (server-only, vía apiFetch). Esta separación evita arrastrar
 * `server-only` a los client components que sólo necesitan tipos o filtrado en cliente.
 */

/**
 * Transacción tal como la consume el dashboard. `verdict` usa el enum REAL del schema
 * (`VerdictStatus`: VERIFIED 🟢 / PENDING 🟡 / SUSPICIOUS 🚨). Los montos van en centavos
 * (convención del schema: `amountCents`).
 */
export interface DashboardTransaction {
  id: string;
  verdict: VerdictStatus;
  amountCents: number;
  approvalNumber: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /** Cuenta receptora asociada (si la API la expone). Opcional: contrato pendiente. */
  accountId?: string | null;
}

/** Filtros del histórico (E10-T6). Todos opcionales; se combinan con AND. */
export interface TransactionFilters {
  /** Veredictos a incluir. Vacío/omitido = todos. */
  verdicts?: VerdictStatus[];
  /** Fecha desde (ISO, inclusive) sobre `createdAt`. */
  from?: string;
  /** Fecha hasta (ISO, inclusive) sobre `createdAt`. */
  to?: string;
  /** Id de cuenta receptora. */
  accountId?: string;
}

/**
 * Aplica los filtros del histórico EN CLIENTE sobre el listado disponible.
 *
 * La fuente de verdad del filtrado es server-side: `listTransactions(filters)` (gap #8) manda
 * los filtros como query params y el backend filtra en la BD dentro de `runAsTenant`. Esta
 * función pura queda como RESPALDO para el ajuste interactivo en el histórico (togglear
 * estados/fechas/cuenta sin recargar la página), coherente con el filtro server-side.
 */
export function applyTransactionFilters(
  transactions: DashboardTransaction[],
  filters: TransactionFilters,
): DashboardTransaction[] {
  const fromTs = filters.from ? Date.parse(filters.from) : null;
  const toTs = filters.to ? Date.parse(filters.to) : null;

  return transactions.filter((tx) => {
    if (filters.verdicts && filters.verdicts.length > 0 && !filters.verdicts.includes(tx.verdict)) {
      return false;
    }
    if (filters.accountId && tx.accountId !== filters.accountId) {
      return false;
    }
    const createdTs = Date.parse(tx.createdAt);
    if (fromTs !== null && !Number.isNaN(createdTs) && createdTs < fromTs) {
      return false;
    }
    if (toTs !== null && !Number.isNaN(createdTs) && createdTs > toTs) {
      return false;
    }
    return true;
  });
}

/** Sospechosas (🚨) primero y más recientes arriba (E10-T7). */
export function sortSuspiciousFirst(
  transactions: DashboardTransaction[],
): DashboardTransaction[] {
  return [...transactions].sort((a, b) => {
    if (a.verdict === "SUSPICIOUS" && b.verdict !== "SUSPICIOUS") return -1;
    if (b.verdict === "SUSPICIOUS" && a.verdict !== "SUSPICIOUS") return 1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}
