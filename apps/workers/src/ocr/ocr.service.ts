import { IssuerBank, OcrStatus } from "@check/database";
import type { OcrProvider } from "@check/ocr";
import { assessOcrQuality, detectIssuerBank, extractVoucher, normalizeImage } from "@check/ocr";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import type { VoucherImageDownloader } from "../storage/storage.service";
import { NORMALIZE_IMAGE, OCR_PROVIDER, VOUCHER_IMAGE_DOWNLOADER } from "./ocr.constants";

/** Registro de banco emisor detectado (string, ej. "nequi") → enum `IssuerBank` de Prisma. */
const ISSUER_BANK_MAP: Record<string, IssuerBank> = {
  nequi: IssuerBank.NEQUI,
  bancolombia: IssuerBank.BANCOLOMBIA,
  daviplata: IssuerBank.DAVIPLATA,
  davivienda: IssuerBank.DAVIVIENDA,
  bbva: IssuerBank.BBVA,
  banco_de_bogota: IssuerBank.BANCO_DE_BOGOTA,
  colpatria: IssuerBank.COLPATRIA,
};

/** Registro `Voucher` mínimo que este servicio necesita leer. */
export interface VoucherRecord {
  readonly id: string;
  readonly storagePath: string | null;
}

/** Campos que este servicio puede escribir de vuelta en `Voucher`. */
export interface VoucherUpdateData {
  ocrText?: string;
  ocrStatus?: OcrStatus;
  issuerBank?: IssuerBank | null;
  amountCents?: number;
  approvalNumber?: string;
  paidAt?: Date;
  destinationAccount?: string;
  beneficiary?: string;
}

/**
 * Subconjunto de `PrismaClient` que el processor de OCR necesita (E05-T3). Permite
 * inyectar un fake en tests unitarios sin depender de una BD real; `PrismaService`
 * lo satisface estructuralmente.
 */
export interface VoucherStore {
  voucher: {
    findUniqueOrThrow(args: { where: { id: string } }): Promise<VoucherRecord>;
    update(args: { where: { id: string }; data: VoucherUpdateData }): Promise<unknown>;
  };
}

/**
 * Servicio que ejecuta el pipeline de OCR de un `Voucher` (E05-T3):
 * descarga la imagen de Storage → normaliza → reconoce texto (Vision) → evalúa
 * calidad → extrae campos estructurados → persiste el resultado.
 *
 * Errores transitorios (descarga de Storage caída, Vision caído/timeout) se
 * propagan como excepción SIN escribir nada en BD, para que el `Worker` de BullMQ
 * reintente el job (ver `ocr.worker.ts`). Fallas permanentes de negocio (calidad
 * insuficiente, comprobante no reconocido por ningún extractor) se persisten como
 * resultado final (`LOW_QUALITY` / `FAILED`) y no lanzan excepción (no se reintentan).
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger("ocr");

  constructor(
    @Inject(PrismaService) private readonly prisma: VoucherStore,
    @Inject(VOUCHER_IMAGE_DOWNLOADER) private readonly storage: VoucherImageDownloader,
    @Inject(OCR_PROVIDER) private readonly ocrProvider: OcrProvider,
    @Inject(NORMALIZE_IMAGE)
    private readonly normalize: (input: Uint8Array) => Promise<Uint8Array> = normalizeImage,
  ) {}

  async process(voucherId: string): Promise<void> {
    const voucher = await this.prisma.voucher.findUniqueOrThrow({ where: { id: voucherId } });
    if (!voucher.storagePath) {
      // Falla permanente de datos (no hay imagen que procesar): no tiene sentido reintentar.
      throw new Error(`Voucher ${voucherId} no tiene storagePath: nada que procesar`);
    }

    // Descarga/normalización: si fallan (red, Storage caído, imagen corrupta) se propaga
    // sin tocar la BD — BullMQ reintenta el job completo.
    const raw = await this.storage.downloadVoucherImage(voucher.storagePath);
    const normalized = await this.normalize(raw);

    const recognized = await this.ocrProvider.recognize(normalized);
    if (!recognized.ok) {
      // Error transitorio típico (Vision caído/timeout): no se persiste nada, se reintenta.
      throw new Error(`OCR falló para el voucher ${voucherId}: ${recognized.error}`);
    }
    const ocrText = recognized.value;

    const quality = assessOcrQuality(ocrText);
    if (!quality.ok) {
      this.logger.warn(`Voucher ${voucherId}: calidad OCR insuficiente (${quality.reason})`);
      await this.prisma.voucher.update({
        where: { id: voucherId },
        data: { ocrText, ocrStatus: OcrStatus.LOW_QUALITY },
      });
      return;
    }

    // Solo observabilidad: `extractVoucher` ya resuelve el extractor/banco internamente.
    const detectedBank = detectIssuerBank(ocrText);
    const extracted = extractVoucher(ocrText);
    if (!extracted.ok) {
      this.logger.warn(
        `Voucher ${voucherId}: comprobante no reconocido por ningún extractor ` +
          `(banco detectado: ${detectedBank ?? "ninguno"}; error: ${extracted.error})`,
      );
      await this.prisma.voucher.update({
        where: { id: voucherId },
        data: { ocrText, ocrStatus: OcrStatus.FAILED },
      });
      return;
    }

    const { value } = extracted;
    await this.prisma.voucher.update({
      where: { id: voucherId },
      data: {
        ocrText,
        ocrStatus: OcrStatus.PROCESSED,
        issuerBank: ISSUER_BANK_MAP[value.issuerBank] ?? null,
        amountCents: value.amount,
        approvalNumber: value.approvalNumber,
        paidAt: new Date(value.paidAtUtc),
        destinationAccount: value.destinationAccount,
        beneficiary: value.beneficiary,
      },
    });
  }
}
