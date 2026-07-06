import { Module } from "@nestjs/common";

import { OcrQueueService } from "./ocr-queue.service";
import { OCR_ENQUEUER, VOUCHER_STORAGE_UPLOADER } from "./public.constants";
import { PublicController } from "./public.controller";
import { PublicVouchersService } from "./public-vouchers.service";
import { VoucherStorageService } from "./voucher-storage.service";

/**
 * Módulo de endpoints públicos de la PWA de fallback (Épica 9). Aislado en su propio
 * módulo/controlador para que el anti-abuso de E09-T7 (rate limit por negocio/IP)
 * pueda montarse aquí sin tocar el resto de la API. `PrismaService` llega vía
 * `DatabaseModule` (@Global).
 */
@Module({
  controllers: [PublicController],
  providers: [
    PublicVouchersService,
    { provide: VOUCHER_STORAGE_UPLOADER, useClass: VoucherStorageService },
    { provide: OCR_ENQUEUER, useClass: OcrQueueService },
  ],
})
export class PublicModule {}
