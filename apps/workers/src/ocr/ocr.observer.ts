import {
  type MetricsRegistry,
  ParserFailureTracker,
  type StructuredLogger,
} from "@check/shared";
import { Inject, Injectable } from "@nestjs/common";

import type { AlertPort } from "../observability/alert.port";
import { ALERT_DISPATCHER, APP_LOGGER, METRICS_REGISTRY } from "../observability/observability.tokens";

/**
 * Observador de observabilidad del pipeline OCR (Épica 11).
 *
 * - E11-T7: registra la tasa de extracción por banco emisor (`recordOutcome`) para las
 *   métricas de salud, y cuenta comprobantes por estado final.
 * - E11-T4: alimenta un `ParserFailureTracker` con "reconocido/no reconocido"; cuando una
 *   ventana de comprobantes cae mayormente en "no reconocido", dispara la alerta de parser
 *   que dejó de matchear (con desglose por banco detectado).
 *
 * `OcrService` invoca `onExtractionResult` tras cada intento de extracción. Que sea un
 * colaborador aparte (no lógica dentro de `OcrService`) mantiene el pipeline OCR limpio y
 * testeable de forma independiente.
 */
@Injectable()
export class OcrObserver {
  private readonly tracker = new ParserFailureTracker({ source: "voucher_ocr" });

  constructor(
    @Inject(METRICS_REGISTRY) private readonly metrics: MetricsRegistry,
    @Inject(ALERT_DISPATCHER) private readonly alerts: AlertPort,
    @Inject(APP_LOGGER) private readonly logger: StructuredLogger,
  ) {}

  /**
   * Registra el resultado de un intento de extracción de comprobante.
   * @param recognized si `extractVoucher` reconoció el comprobante.
   * @param detectedBank banco emisor detectado (o `null` si ninguno).
   */
  onExtractionResult(recognized: boolean, detectedBank: string | null): void {
    const bank = detectedBank ?? "desconocido";
    this.metrics.recordOutcome("voucher_extraction", bank, recognized);
    this.metrics.increment(recognized ? "voucher_extraction_ok" : "voucher_extraction_failed");

    const alert = this.tracker.record(recognized, bank);
    if (alert) {
      this.logger.warn("parser de comprobantes dejó de matchear", { ...alert.context });
      void this.alerts.dispatch(alert);
    }
  }

  /** Registra la duración (ms) del pipeline OCR de punta a punta (E11-T7). */
  recordProcessingDuration(ms: number): void {
    this.metrics.recordDuration("ocr_processing_ms", ms);
  }
}
