import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import type { OcrStatus, VerdictStatus } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import type { OcrEnqueuer } from "./ocr-queue.service";
import {
  ALLOWED_VOUCHER_MIME_TYPES,
  MAX_VOUCHER_FILE_BYTES,
  OCR_ENQUEUER,
  VOUCHER_STORAGE_UPLOADER,
} from "./public.constants";
import type { VoucherStorageUploader } from "./voucher-storage.service";

/** Subconjunto del file de multer que la ingesta necesita (fakes en tests). */
export interface UploadedVoucherFile {
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}

/** Respuesta pública de identificación del negocio (E09-T2). SOLO el nombre. */
export interface PublicBusinessDto {
  name: string;
}

/** Respuesta pública de estado de un comprobante (E09-T4/T5, polling del semáforo). */
export interface PublicVoucherStatusDto {
  ocrStatus: OcrStatus;
  /** Veredicto antifraude de la Transaction asociada; null si aún no existe (🟡). */
  verdict: VerdictStatus | null;
}

/**
 * Subconjunto de `PrismaClient` que este servicio necesita. Permite inyectar un fake
 * en tests unitarios sin BD real; `PrismaService` lo satisface estructuralmente
 * (mismo patrón que `VoucherStore` en `apps/workers/src/ocr/ocr.service.ts`).
 */
export interface PublicStore {
  business: {
    findUnique(args: {
      where: { opaqueId: string };
      select: { id: true; name: true };
    }): Promise<{ id: string; name: string } | null>;
  };
  voucher: {
    create(args: {
      data: { businessId: string; storagePath: string };
    }): Promise<{ id: string }>;
    findUnique(args: {
      where: { id: string };
      select: { ocrStatus: true; transaction: { select: { verdict: true } } };
    }): Promise<{ ocrStatus: OcrStatus; transaction: { verdict: VerdictStatus } | null } | null>;
  };
}

/**
 * Lógica de los endpoints públicos de la PWA (E09-T2/T4). El negocio SIEMPRE se
 * resuelve server-side a partir del `opaqueId` de la URL; nunca se confía en un
 * `businessId` del cliente ni se expone el id interno o el buzón en las respuestas.
 */
@Injectable()
export class PublicVouchersService {
  private readonly logger = new Logger("public-vouchers");

  constructor(
    @Inject(PrismaService) private readonly prisma: PublicStore,
    @Inject(VOUCHER_STORAGE_UPLOADER) private readonly storage: VoucherStorageUploader,
    @Inject(OCR_ENQUEUER) private readonly ocrQueue: OcrEnqueuer,
  ) {}

  /** E09-T2: resuelve el negocio por su `opaqueId`. Devuelve SOLO el nombre. */
  async getBusinessName(opaqueId: string): Promise<PublicBusinessDto> {
    const business = await this.findBusiness(opaqueId);
    return { name: business.name };
  }

  /**
   * E09-T4: recibe un comprobante (imagen/PDF), lo sube a Storage, crea el `Voucher`
   * ligado al negocio resuelto por `opaqueId` y lo encola al MISMO pipeline OCR →
   * verificación de las Épicas 5/6 (cola `ocr-processing`).
   */
  async ingestVoucher(
    opaqueId: string,
    file: UploadedVoucherFile,
  ): Promise<{ voucherId: string }> {
    const business = await this.findBusiness(opaqueId);

    const extension = ALLOWED_VOUCHER_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new UnsupportedMediaTypeException(`Tipo de archivo no soportado: ${file.mimetype}`);
    }
    // Defensa en profundidad: multer ya limita el tamaño en el interceptor (413),
    // pero el servicio no debe depender de eso para otros callers.
    if (file.size > MAX_VOUCHER_FILE_BYTES) {
      throw new PayloadTooLargeException("El archivo supera el máximo de 10 MB");
    }

    // Nombre no adivinable dentro del prefijo del negocio: el bucket es privado y
    // nada de la ruta se expone al cliente (solo recibe el id del Voucher).
    const storagePath = `${business.id}/${randomUUID()}.${extension}`;
    await this.storage.uploadVoucher(storagePath, file.buffer, file.mimetype);

    const voucher = await this.prisma.voucher.create({
      data: { businessId: business.id, storagePath },
    });

    // Si el encolado falla (Redis caído) se propaga como 500: el Voucher quedaría
    // PENDING sin job y el cliente debe reintentar la subida.
    await this.ocrQueue.enqueueVoucherOcr(voucher.id);
    this.logger.log(`Comprobante público ${voucher.id} encolado para OCR`);

    return { voucherId: voucher.id };
  }

  /**
   * E09-T4/T5: estado de un comprobante para el polling del semáforo. El cuid del
   * Voucher es el handle público; no se devuelve nada del negocio ni de otros vouchers.
   */
  async getVoucherStatus(voucherId: string): Promise<PublicVoucherStatusDto> {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
      select: { ocrStatus: true, transaction: { select: { verdict: true } } },
    });
    if (!voucher) throw new NotFoundException("Comprobante no encontrado");
    return { ocrStatus: voucher.ocrStatus, verdict: voucher.transaction?.verdict ?? null };
  }

  private async findBusiness(opaqueId: string): Promise<{ id: string; name: string }> {
    const business = await this.prisma.business.findUnique({
      where: { opaqueId },
      select: { id: true, name: true },
    });
    if (!business) throw new NotFoundException("Negocio no encontrado");
    return business;
  }
}
