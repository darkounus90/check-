import "server-only";

import { apiFetch } from "@/lib/data/api-client";
import type { DashboardTransaction, TransactionFilters } from "@/lib/data/transaction-types";

// Re-export de los tipos/helpers puros para que los consumidores server-side puedan
// seguir importándolos desde este módulo. Los client components deben importar desde
// `transaction-types.ts` directamente (sin `server-only`).
export type {
  DashboardTransaction,
  TransactionFilters,
} from "@/lib/data/transaction-types";
export {
  applyTransactionFilters,
  sortSuspiciousFirst,
} from "@/lib/data/transaction-types";

/**
 * Traduce los filtros del histórico a la query string del endpoint autenticado
 * `GET /transactions` (gap #8). El backend aplica los filtros server-side (dentro de
 * `runAsTenant`, con la RLS de la Épica 2), así que el filtrado grande no viaja al cliente.
 */
function buildTransactionsQuery(filters: TransactionFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.verdicts && filters.verdicts.length > 0) {
    // El backend acepta `verdict` repetido o CSV; usamos CSV para una URL compacta.
    params.set("verdict", filters.verdicts.join(","));
  }
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.accountId) params.set("accountId", filters.accountId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Lista las transacciones del negocio del usuario vía el endpoint autenticado
 * `GET /transactions` (gap #8), que hereda el aislamiento RLS que la API aplica server-side.
 *
 * Los `filters` (estado/fecha/cuenta) se envían como query params para que el backend filtre
 * en la BD. El histórico también conserva `applyTransactionFilters` en cliente como respaldo
 * para el ajuste interactivo de filtros sin recargar.
 */
export async function listTransactions(
  filters: TransactionFilters = {},
): Promise<DashboardTransaction[]> {
  return apiFetch<DashboardTransaction[]>(`/transactions${buildTransactionsQuery(filters)}`);
}
