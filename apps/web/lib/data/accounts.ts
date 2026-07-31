import "server-only";

import { apiFetch } from "@/lib/data/api-client";

/** Entidades receptoras soportadas (enum `ReceiverBank` del schema). Incluye billeteras
 * cuya "cuenta" es una llave Bre-B (número de celular). */
export type ReceiverBank = "BANCOLOMBIA" | "DAVIVIENDA" | "BBVA" | "NEQUI" | "DAVIPLATA";

/** Cuenta receptora del negocio (respuesta de `GET /accounts`). */
export interface ReceivingAccount {
  id: string;
  businessId: string;
  bank: ReceiverBank;
  accountNumber: string;
  alias: string | null;
  createdAt: string;
}

/**
 * Cuentas receptoras del negocio del usuario, SIEMPRE vía API (endpoint existente
 * `GET /accounts`, aislado por negocio server-side). Consulta real de ejemplo end-to-end
 * de la capa de datos (E10-T2); la vista del dueño la consumirá en E10-T8.
 */
export async function getReceivingAccounts(): Promise<ReceivingAccount[]> {
  return apiFetch<ReceivingAccount[]>("/accounts");
}
