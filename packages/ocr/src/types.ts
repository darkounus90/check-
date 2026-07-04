import type { Cents, Result } from "@check/shared";

/** Campos estructurados extraídos de un comprobante de pago del pagador. */
export interface ExtractedVoucher {
  readonly issuerBank: string;
  readonly amount: Cents;
  readonly approvalNumber: string;
  /** Instante del pago en UTC (ISO 8601). */
  readonly paidAtUtc: string;
  readonly destinationAccount: string;
  readonly beneficiary: string;
}

/** Contrato del extractor estructurado por banco emisor (versionado). */
export interface VoucherExtractor {
  readonly issuerBank: string;
  readonly version: string;
  matches(ocrText: string): boolean;
  extract(ocrText: string): Result<ExtractedVoucher>;
}

/** Contrato del proveedor de OCR (bytes de imagen/PDF → texto plano). */
export interface OcrProvider {
  recognize(input: Uint8Array): Promise<Result<string>>;
}

/** Resultado del chequeo de calidad del OCR (E05-T13). */
export interface OcrQuality {
  readonly ok: boolean;
  readonly reason?: string;
}
