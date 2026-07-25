"use client";

import { useEffect, useState } from "react";

interface Status {
  connected: boolean;
  qrDataUrl: string | null;
  phoneNumber: string | null;
}

/** Cada cuánto se refresca el estado/QR (ms). El QR de WhatsApp rota cada ~20s. */
const POLL_INTERVAL_MS = 3000;

/**
 * Pantalla "Conectar WhatsApp": el admin ve el QR y lo escanea con su teléfono. Hace polling
 * al route handler `/api/whatsapp-status` (que trae el estado desde la API y renderiza el QR).
 * Cuando el número queda vinculado, muestra el estado conectado.
 */
export function WhatsappConnect() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/whatsapp-status", { cache: "no-store" });
        if (res.ok && !cancelled) setStatus((await res.json()) as Status);
      } catch {
        // Silencioso: un fallo puntual no debe romper el polling.
      }
    }
    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (status?.connected) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-3xl">✅</p>
        <h2 className="mt-2 text-lg font-semibold text-green-800">WhatsApp conectado</h2>
        <p className="mt-1 text-sm text-green-700">
          El número está vinculado y respondiendo. El cajero ya puede enviar comprobantes por
          WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="grid gap-6 md:grid-cols-[320px_1fr] md:items-center">
        <div className="flex aspect-square items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
          {status?.qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={status.qrDataUrl} alt="Código QR para vincular WhatsApp" className="h-full w-full" />
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              <span className="mb-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              <p>Generando el código QR…</p>
              <p className="mt-1 text-xs">Si tarda, revisa que el servicio de WhatsApp esté encendido.</p>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-800">Vincula tu WhatsApp</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>Abre <b>WhatsApp</b> en el teléfono del negocio.</li>
            <li>Ve a <b>Ajustes → Dispositivos vinculados</b>.</li>
            <li>Toca <b>Vincular un dispositivo</b>.</li>
            <li>Apunta la cámara a este <b>código QR</b>.</li>
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            El código se actualiza solo cada pocos segundos. Cuando conectes, esta pantalla lo
            confirmará automáticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
