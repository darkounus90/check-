import type { Cents, Result } from "@check/shared";

/**
 * OCR y extracción estructurada del comprobante del pagador.
 *
 * Placeholder de la Épica 1 (E01-T7): contrato del proveedor de OCR.
 * La integración real con Google Cloud Vision y los parsers por banco emisor
 * (Nequi, Bancolombia, Daviplata, ...) llegan en la Épica 5.
 */

/** Campos estructurados extraídos de un comprobante de pago. */
export interface ExtractedVoucher {
  /** Banco emisor detectado (p. ej. "nequi"). */
  readonly issuerBank: string;
  readonly amount: Cents;
  readonly approvalNumber: string;
  /** Instante del pago en UTC (ISO 8601). */
  readonly paidAtUtc: string;
  readonly destinationAccount: string;
  readonly beneficiary: string;
}

/** Contrato del proveedor de OCR (texto crudo desde imagen/PDF). */
export interface OcrProvider {
  /** Ejecuta OCR sobre los bytes de una imagen o PDF y devuelve el texto plano. */
  recognize(input: Uint8Array): Promise<Result<string>>;
}

/** Contrato del extractor estructurado por banco emisor. */
export interface VoucherExtractor {
  readonly issuerBank: string;
  readonly version: string;
  matches(ocrText: string): boolean;
  extract(ocrText: string): Result<ExtractedVoucher>;
}

/** Registro de extractores. Vacío en el MVP inicial; se llena en la Épica 5. */
export const voucherExtractorRegistry: readonly VoucherExtractor[] = [];
