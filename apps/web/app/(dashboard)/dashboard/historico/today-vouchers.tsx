import { VerdictBadge } from "@/components/ui/verdict-badge";
import type { DashboardVoucher, OcrStatus } from "@/lib/data/vouchers";
import { formatCents, formatDateTime } from "@/lib/format";

/** Etiqueta del estado de OCR cuando el comprobante aún no tiene veredicto. */
const OCR_META: Record<OcrStatus, { emoji: string; label: string; badge: string }> = {
  PENDING: { emoji: "⏳", label: "En cola", badge: "bg-slate-50 text-slate-600 border-slate-200" },
  PROCESSED: {
    emoji: "🔎",
    label: "Verificando",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
  },
  LOW_QUALITY: {
    emoji: "⚠️",
    label: "Foto ilegible",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
  },
  FAILED: { emoji: "✕", label: "OCR falló", badge: "bg-red-50 text-red-700 border-red-200" },
};

const BANK_LABEL: Record<string, string> = {
  NEQUI: "Nequi",
  BANCOLOMBIA: "Bancolombia",
  DAVIPLATA: "DaviPlata",
  DAVIVIENDA: "Davivienda",
  BBVA: "BBVA",
  BANCO_DE_BOGOTA: "Banco de Bogotá",
  COLPATRIA: "Colpatria",
};

/**
 * Resumen "Comprobantes de hoy": muestra el total y cada comprobante subido en el día,
 * incluidos los que aún están en OCR o fallaron (que no aparecen en el histórico de
 * transacciones porque todavía no generan una verificación). Renderizado server-side.
 */
export function TodayVouchers({ vouchers }: { vouchers: DashboardVoucher[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Comprobantes de hoy
        </h2>
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-900 px-2 text-sm font-semibold text-white">
          {vouchers.length}
        </span>
      </div>

      {vouchers.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Aún no se ha subido ningún comprobante hoy.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {vouchers.map((v) => {
            const ocr = OCR_META[v.ocrStatus];
            return (
              <li key={v.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {v.amountCents != null ? formatCents(v.amountCents) : "Monto no leído"}
                    {v.issuerBank ? (
                      <span className="ml-2 text-slate-500">
                        · {BANK_LABEL[v.issuerBank] ?? v.issuerBank}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(v.createdAt)}
                    {v.approvalNumber ? ` · Aprob. ${v.approvalNumber}` : ""}
                  </p>
                </div>
                {v.verdict ? (
                  <VerdictBadge verdict={v.verdict} />
                ) : (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${ocr.badge}`}
                  >
                    <span aria-hidden>{ocr.emoji}</span>
                    {ocr.label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
