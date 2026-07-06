import { err, type Result } from "@check/shared";

import { voucherExtractorRegistry } from "./detect.js";
import type { ExtractedVoucher } from "./types.js";

export { detectIssuerBank, voucherExtractorRegistry } from "./detect.js";
export { isUnsupportedByOcrPipeline, normalizeImage } from "./preprocess.js";
export { GoogleVisionProvider, TextOcrProvider } from "./providers/google-vision.js";
export { assessOcrQuality } from "./quality.js";
export type { ExtractedVoucher, OcrProvider, OcrQuality, VoucherExtractor } from "./types.js";

/**
 * Extrae los campos estructurados de un comprobante a partir del texto OCR (E05-T12).
 * Selecciona el primer extractor cuyo banco reconoce el texto.
 */
export function extractVoucher(ocrText: string): Result<ExtractedVoucher> {
  for (const extractor of voucherExtractorRegistry) {
    if (extractor.matches(ocrText)) return extractor.extract(ocrText);
  }
  return err("comprobante no reconocido por ningún extractor");
}
