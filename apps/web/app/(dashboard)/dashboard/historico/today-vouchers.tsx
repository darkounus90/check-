"use client";

import { useEffect, useState } from "react";

import { VerdictBadge } from "@/components/ui/verdict-badge";
import type { DashboardVoucher, OcrStatus } from "@/lib/data/voucher-types";
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

/** Cuántos comprobantes se muestran antes de plegar el resto en el acordeón. */
const VISIBLE_LIMIT = 4;
/** Cada cuánto se refresca el recuadro (ms). */
const POLL_INTERVAL_MS = 5000;

function VoucherRow({ v }: { v: DashboardVoucher }) {
  const ocr = OCR_META[v.ocrStatus];
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">
          {v.amountCents != null ? formatCents(v.amountCents) : "Monto no leído"}
          {v.issuerBank ? (
            <span className="ml-2 text-slate-500">· {BANK_LABEL[v.issuerBank] ?? v.issuerBank}</span>
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
}

/**
 * Recuadro "Comprobantes de hoy": total, los últimos {VISIBLE_LIMIT} comprobantes y un
 * acordeón "Mostrar más" para el resto. Se refresca solo en tiempo real (polling cada
 * {POLL_INTERVAL_MS} ms) SIN recargar la página — el resto del histórico no se toca.
 *
 * Recibe `initialVouchers` renderizados server-side para pintar de inmediato (sin parpadeo)
 * y a partir de ahí actualiza por su cuenta.
 */
export function TodayVouchers({ initialVouchers }: { initialVouchers: DashboardVoucher[] }) {
  const [vouchers, setVouchers] = useState<DashboardVoucher[]>(initialVouchers);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/today-vouchers", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as DashboardVoucher[];
        if (!cancelled) setVouchers(data);
      } catch {
        // Silencioso: un fallo de red puntual no debe romper el recuadro.
      }
    }
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const visible = vouchers.slice(0, VISIBLE_LIMIT);
  const rest = vouchers.slice(VISIBLE_LIMIT);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Comprobantes de hoy
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-green-500" title="En vivo" />
        </h2>
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-900 px-2 text-sm font-semibold text-white">
          {vouchers.length}
        </span>
      </div>

      {vouchers.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Aún no se ha subido ningún comprobante hoy.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-slate-100">
            {visible.map((v) => (
              <VoucherRow key={v.id} v={v} />
            ))}
          </ul>

          {rest.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
                className="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                {expanded ? "Mostrar menos" : `Mostrar más (${rest.length})`}
                <span aria-hidden className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>
              {expanded && (
                <ul className="divide-y divide-slate-100">
                  {rest.map((v) => (
                    <VoucherRow key={v.id} v={v} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
