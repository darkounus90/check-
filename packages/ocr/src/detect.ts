import {
  bancoBogotaV1,
  bancolombiaVoucherV1,
  bbvaVoucherV1,
  colpatriaV1,
  daviplataV1,
  daviviendaVoucherV1,
  nequiV1,
} from "./extractors.js";
import type { VoucherExtractor } from "./types.js";

/**
 * Registro de extractores por banco emisor (E05-T12). Agregar un banco = añadir su
 * extractor aquí. `banco_de_bogota` va antes que `bancolombia` para desambiguar el prefijo.
 */
export const voucherExtractorRegistry: readonly VoucherExtractor[] = [
  bancoBogotaV1,
  bancolombiaVoucherV1,
  nequiV1,
  daviplataV1,
  daviviendaVoucherV1,
  bbvaVoucherV1,
  colpatriaV1,
];

/** Detecta el banco emisor a partir del texto OCR (E05-T4). Null si es desconocido. */
export function detectIssuerBank(ocrText: string): string | null {
  return voucherExtractorRegistry.find((e) => e.matches(ocrText))?.issuerBank ?? null;
}
