import { Module } from "@nestjs/common";

import { CryptoModule } from "./crypto/crypto.module";
import { DatabaseModule } from "./database/database.module";
import { ObservabilityModule } from "./observability/observability.module";
import { OcrModule } from "./ocr/ocr.module";
import { RetentionModule } from "./retention/retention.module";
import { VerificationModule } from "./verification/verification.module";
import { WhatsAppModule } from "./whatsapp/whatsapp.module";

/**
 * Módulo raíz de los workers.
 *
 * OCR de comprobantes (E05-T3) ya está registrado vía `OcrModule`. El motor de
 * verificación antifraude (cola, worker/consumer y persistencia del veredicto,
 * E06-T11/E06-T12) está registrado vía `VerificationModule`: `OcrModule` la encola al
 * terminar el OCR con éxito, y `VerificationWorker` la consume de punta a punta.
 * La capa WhatsApp (Épica 7, Grupo A: instancia Baileys con auth-state en Postgres,
 * ingesta al pipeline OCR y respuesta del semáforo) está registrada vía `WhatsAppModule`;
 * se activa con `WHATSAPP_ENABLED=true`. Humanización/warmeo/pool (Grupos B/C) se suman aquí.
 */
@Module({
  imports: [
    DatabaseModule,
    CryptoModule,
    ObservabilityModule,
    OcrModule,
    VerificationModule,
    WhatsAppModule,
    // E12-T3: job de purga por política de retención.
    RetentionModule,
  ],
})
export class AppModule {}
