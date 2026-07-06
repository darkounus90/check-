import "server-only";

import { apiFetch, DashboardApiError } from "@/lib/data/api-client";
import type { DashboardTransaction } from "@/lib/data/transaction-types";

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
 * Lista las transacciones del negocio del usuario, SIEMPRE vía API (hereda el
 * aislamiento RLS que la API aplica server-side).
 *
 * NOTA (contrato pendiente / GAP documentado): el endpoint autenticado de listado de
 * transacciones para el dueño NO existe todavía en `apps/api` (E10-T6 es trabajo de otra
 * ola del backend). Hasta que exista, esta función DEGRADA de forma segura: si la API
 * responde 404 (ruta inexistente) devuelve lista vacía en vez de romper la vista. El resto
 * de errores se propaga para que la UI muestre su estado de error.
 */
export async function listTransactions(): Promise<DashboardTransaction[]> {
  try {
    return await apiFetch<DashboardTransaction[]>("/transactions");
  } catch (error) {
    if (error instanceof DashboardApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
}
