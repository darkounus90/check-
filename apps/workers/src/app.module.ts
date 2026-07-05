import { Module } from "@nestjs/common";

import { OcrModule } from "./ocr/ocr.module";

/**
 * Módulo raíz de los workers.
 *
 * OCR de comprobantes (E05-T3) ya está registrado vía `OcrModule`. Verificación
 * y warmeo de WhatsApp (Épicas 6/7) se agregan aquí conforme avanzan.
 */
@Module({
  imports: [OcrModule],
})
export class AppModule {}
