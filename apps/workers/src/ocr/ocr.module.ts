import { GoogleVisionProvider, normalizeImage } from "@check/ocr";
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { StorageModule } from "../storage/storage.module";
import { StorageService } from "../storage/storage.service";
import { VerificationModule } from "../verification/verification.module";
import { VerificationQueueService } from "../verification/verification.queue";
import {
  NORMALIZE_IMAGE,
  OCR_PROVIDER,
  VERIFICATION_ENQUEUER,
  VOUCHER_IMAGE_DOWNLOADER,
} from "./ocr.constants";
import { OcrQueueService } from "./ocr.queue";
import { OcrService } from "./ocr.service";
import { OcrWorker } from "./ocr.worker";

/**
 * Módulo de OCR de comprobantes (E05-T3): cola BullMQ (`OcrQueueService`), consumer
 * (`OcrWorker`) y la lógica del pipeline (`OcrService`). Importa `VerificationModule`
 * (E06-T12) para que, al terminar el OCR con éxito, `OcrService` pueda encolar la
 * verificación antifraude del comprobante (`VerificationQueueService.enqueueVerification`).
 */
@Module({
  imports: [DatabaseModule, StorageModule, VerificationModule],
  providers: [
    OcrService,
    OcrQueueService,
    OcrWorker,
    { provide: OCR_PROVIDER, useValue: new GoogleVisionProvider() },
    { provide: VOUCHER_IMAGE_DOWNLOADER, useExisting: StorageService },
    { provide: NORMALIZE_IMAGE, useValue: normalizeImage },
    { provide: VERIFICATION_ENQUEUER, useExisting: VerificationQueueService },
  ],
  exports: [OcrQueueService],
})
export class OcrModule {}
