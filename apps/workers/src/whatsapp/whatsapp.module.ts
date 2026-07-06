import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { OcrModule } from "../ocr/ocr.module";
import { OcrQueueService } from "../ocr/ocr.queue";
import { StorageModule } from "../storage/storage.module";
import { WhatsAppManager } from "./whatsapp.manager";
import { WhatsAppStore } from "./whatsapp.store";
import { OCR_QUEUE } from "./whatsapp.tokens";

/**
 * Módulo de la capa WhatsApp en los workers (Épica 7, Grupo A: E07-T1/T2/T3).
 *
 * `WhatsAppManager` levanta la instancia Baileys (auth-state en Postgres) y el poller de
 * veredictos; `WhatsAppStore` implementa los puertos de `@check/whatsapp` contra Prisma,
 * el `StorageService` (subida a Storage) y la MISMA cola OCR del pipeline (`OcrQueueService`,
 * reexportada por `OcrModule`, E05-T3). No se toca el OCR ni la verificación existentes.
 */
@Module({
  imports: [DatabaseModule, StorageModule, OcrModule],
  providers: [
    WhatsAppStore,
    WhatsAppManager,
    { provide: OCR_QUEUE, useExisting: OcrQueueService },
  ],
})
export class WhatsAppModule {}
