import "server-only";

import { apiFetch } from "@/lib/data/api-client";
import type { DashboardVoucher } from "@/lib/data/voucher-types";

export type { DashboardVoucher, OcrStatus, Verdict } from "@/lib/data/voucher-types";

/**
 * Lista los comprobantes de HOY del negocio del usuario vía `GET /vouchers` (autenticado,
 * aislado por RLS server-side). Incluye los que aún están en OCR o que fallaron.
 */
export function listTodayVouchers(): Promise<DashboardVoucher[]> {
  return apiFetch<DashboardVoucher[]>("/vouchers");
}
