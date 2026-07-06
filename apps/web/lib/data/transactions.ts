import "server-only";

import { apiFetch, DashboardApiError } from "@/lib/data/api-client";
import type { VerdictStatus } from "@/lib/supabase/types";

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
}

/**
 * Lista las transacciones del negocio del usuario, SIEMPRE vía API (hereda el
 * aislamiento RLS que la API aplica server-side).
 *
 * NOTA (contrato pendiente): el endpoint autenticado de listado de transacciones para el
 * dueño es trabajo de otra ola en `apps/api` (E10-T6). Hasta que exista, esta función
 * DEGRADA de forma segura: si la API responde 404 (ruta inexistente) devuelve lista
 * vacía en vez de romper la vista. El resto de errores se propaga.
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
