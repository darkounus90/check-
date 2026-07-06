"use client";

import Image from "next/image";
import { useCallback } from "react";

import type { BusinessQr } from "@/lib/data/business-qr";

/**
 * Vista del QR imprimible del negocio (E08-T6). Muestra el QR y ofrece descargar PNG y SVG,
 * más copiar la URL estable. Los artefactos ya vienen renderizados por la API (`GET /me/qr`);
 * aquí solo se presentan y se disparan las descargas en cliente (data URI / blob).
 */
export function QrView({ qr }: { qr: BusinessQr }) {
  const downloadPng = useCallback(() => {
    const link = document.createElement("a");
    link.href = qr.pngDataUrl;
    link.download = "check-qr.png";
    link.click();
  }, [qr.pngDataUrl]);

  const downloadSvg = useCallback(() => {
    const blob = new Blob([qr.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "check-qr.svg";
    link.click();
    URL.revokeObjectURL(url);
  }, [qr.svg]);

  return (
    <div className="flex flex-col items-center gap-6 rounded-lg border border-slate-200 bg-white p-6">
      <Image
        src={qr.pngDataUrl}
        alt="Código QR del negocio"
        width={256}
        height={256}
        unoptimized
        className="h-64 w-64"
      />
      <p className="break-all text-center text-sm text-slate-600">{qr.url}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={downloadPng}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Descargar PNG
        </button>
        <button
          type="button"
          onClick={downloadSvg}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Descargar SVG
        </button>
      </div>
    </div>
  );
}
