import type { OcrQuality } from "./types.js";

/**
 * Heurística de calidad del OCR (E05-T13). Ante texto pobre pide una mejor foto
 * en lugar de dar un falso 🚨.
 */
export function assessOcrQuality(ocrText: string): OcrQuality {
  const clean = ocrText.trim();
  if (clean.length < 20) {
    return { ok: false, reason: "Texto insuficiente: envía una foto más clara del comprobante." };
  }
  if (!/\d/.test(clean)) {
    return { ok: false, reason: "No se detectan cifras: envía una foto más nítida." };
  }
  if (!/\$/.test(clean)) {
    return { ok: false, reason: "No se detecta el monto: asegúrate de que se vea completo." };
  }
  return { ok: true };
}
