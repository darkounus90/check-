import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { PrismaApprovalNumberGateway } from "./verification.approval-gateway";
import { VERIFICATION_CLOCK } from "./verification.constants";
import { VerificationProcessorService } from "./verification.processor";
import { VerificationQueueService } from "./verification.queue";
import { VerificationService } from "./verification.service";
import { VerificationWorker } from "./verification.worker";

/**
 * Módulo de verificación antifraude (E06-T11/E06-T12): `VerificationService` persiste
 * el veredicto (`Transaction` + `EvidenceSource` + `MoneyOpLog`, atómico); cola
 * (`VerificationQueueService`), consumer (`VerificationWorker`) y orquestador
 * (`VerificationProcessorService`) arman el flujo end-to-end: comprobante ya procesado
 * por OCR → contexto (correos, base global de aprobaciones) → 7 defensas reales
 * (`@check/verifier`) → veredicto persistido, con reintento dentro de la ventana de
 * espera del correo real del banco receptor cuando el veredicto queda `PENDING`.
 *
 * `VerificationQueueService` se exporta para que `OcrModule` pueda encolar la
 * verificación al terminar el OCR con éxito (ver `apps/workers/src/ocr/ocr.service.ts`).
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    VerificationService,
    VerificationQueueService,
    VerificationWorker,
    VerificationProcessorService,
    PrismaApprovalNumberGateway,
    { provide: VERIFICATION_CLOCK, useValue: () => new Date().toISOString() },
  ],
  exports: [VerificationService, VerificationQueueService],
})
export class VerificationModule {}
