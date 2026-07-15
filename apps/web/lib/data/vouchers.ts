import "server-only";

import { apiFetch } from "@/lib/data/api-client";

/** Estado del pipeline de OCR (coincide con el enum `OcrStatus` de la BD). */
export type OcrStatus = "PENDING" | "PROCESSED" | "LOW_QUALITY" | "FAILED";

/** Veredicto de la verificación (coincide con `VerdictStatus`). */
export type Verdict = "VERIFIED" | "PENDING" | "SUSPICIOUS";

/** Comprobante del día tal como lo devuelve `GET /vouchers`. */
export interface DashboardVoucher {
  id: string;
  ocrStatus: OcrStatus;
  issuerBank: string | null;
  amountCents: number | null;
  approvalNumber: string | null;
  createdAt: string;
  verdict: Verdict | null;
}

/**
 * Lista los comprobantes de HOY del negocio del usuario vía `GET /vouchers` (autenticado,
 * aislado por RLS server-side). Incluye los que aún están en OCR o que fallaron.
 */
export function listTodayVouchers(): Promise<DashboardVoucher[]> {
  return apiFetch<DashboardVoucher[]>("/vouchers");
}
