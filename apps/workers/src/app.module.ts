import { Module } from "@nestjs/common";

import { OcrModule } from "./ocr/ocr.module";
import { VerificationModule } from "./verification/verification.module";

/**
 * Módulo raíz de los workers.
 *
 * OCR de comprobantes (E05-T3) ya está registrado vía `OcrModule`. El motor de
 * verificación antifraude (cola, worker/consumer y persistencia del veredicto,
 * E06-T11/E06-T12) está registrado vía `VerificationModule`: `OcrModule` la encola al
 * terminar el OCR con éxito, y `VerificationWorker` la consume de punta a punta.
 * Warmeo de WhatsApp (Épica 7) se agrega aquí conforme avanza.
 */
@Module({
  imports: [OcrModule, VerificationModule],
})
export class AppModule {}
