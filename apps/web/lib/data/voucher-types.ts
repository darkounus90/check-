// Tipos puros de comprobantes (sin `server-only`) para que los consuman tanto los
// componentes server como los client. La lógica de fetch server-side vive en `vouchers.ts`.

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
