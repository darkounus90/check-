import {
  type AlertDispatcher,
  type AlertEvent,
  evaluateQueueDepth,
  type QueueAlertThresholds,
  type QueueDepthSnapshot,
  type StructuredLogger,
} from "@check/shared";
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { env } from "../env";
import { OcrQueueService } from "../ocr/ocr.queue";
import { ALERT_DISPATCHER, APP_LOGGER } from "./observability.tokens";

/** Contrato mínimo para leer la profundidad de una cola (satisfecho por `OcrQueueService`). */
export interface QueueDepthProbe {
  getDepth(): Promise<QueueDepthSnapshot>;
}

/**
 * Monitor de colas atascadas (Épica 11, E11-T5).
 *
 * Cada `QUEUE_MONITOR_INTERVAL_MS` toma una foto de la cola OCR (backlog/activos/fallidos/edad
 * del job más antiguo) y, si supera los umbrales configurados, dispara una alerta al canal
 * del equipo. La evaluación de umbral es la función pura `evaluateQueueDepth` de `@check/shared`.
 *
 * El `setInterval` no arranca en `NODE_ENV=test` (evita timers colgados en los tests de env);
 * la lógica se ejerce llamando `checkOnce()` directamente.
 */
@Injectable()
export class QueueMonitorService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private readonly thresholds: QueueAlertThresholds;

  constructor(
    @Inject(OcrQueueService) private readonly ocrQueue: QueueDepthProbe,
    @Inject(ALERT_DISPATCHER) private readonly alerts: AlertDispatcher,
    @Inject(APP_LOGGER) private readonly logger: StructuredLogger,
  ) {
    this.thresholds = {
      maxWaiting: env.QUEUE_MONITOR_MAX_WAITING,
      maxFailed: env.QUEUE_MONITOR_MAX_FAILED,
      maxOldestWaitingMs: env.QUEUE_MONITOR_MAX_OLDEST_MS,
    };
  }

  onModuleInit(): void {
    if (env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.checkOnce();
    }, env.QUEUE_MONITOR_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Un ciclo del monitor: lee la foto, evalúa umbrales y despacha alerta si aplica. Aislado:
   * un fallo leyendo la cola se loguea (y podría ser síntoma de Redis caído) pero no rompe el
   * intervalo. Público para ejercerlo en test. Devuelve la alerta emitida (o `null`).
   */
  async checkOnce(): Promise<AlertEvent | null> {
    let snapshot: QueueDepthSnapshot;
    try {
      snapshot = await this.ocrQueue.getDepth();
    } catch (error) {
      this.logger.error("monitor de colas no pudo leer la cola OCR", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    const alert = evaluateQueueDepth(snapshot, this.thresholds);
    if (alert) {
      this.logger.warn("cola atascada detectada", { ...alert.context });
      void this.alerts.dispatch(alert);
    }
    return alert;
  }
}
