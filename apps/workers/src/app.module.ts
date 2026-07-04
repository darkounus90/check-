import { Module } from "@nestjs/common";

/**
 * Módulo raíz de los workers.
 *
 * Placeholder de la Épica 1 (E01-T11). Los workers reales (OCR, verificación,
 * warmeo de WhatsApp) se registran aquí conforme avanzan las Épicas 5, 6 y 7,
 * consumiendo colas de BullMQ.
 */
@Module({})
export class AppModule {}
