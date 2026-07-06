import {
  AlertDispatcher,
  buildAlertTransportFromEnv,
  MetricsRegistry,
  StructuredLogger,
} from "@check/shared";
import { Global, Module } from "@nestjs/common";

import { env } from "../env";
import { OcrModule } from "../ocr/ocr.module";
import { GlobalErrorCapture } from "./global-error-capture";
import { HealthService } from "./health.service";
import { ALERT_DISPATCHER, APP_LOGGER, METRICS_REGISTRY } from "./observability.tokens";
import { QueueMonitorService } from "./queue-monitor.service";

/**
 * Capa de observabilidad de los workers (Épica 11).
 *
 * Provee, para todo el árbol de módulos (`@Global`):
 * - `APP_LOGGER`: logger estructurado JSON con `{ service: "workers" }` (E11-T1).
 * - `ALERT_DISPATCHER`: cola/despachador de alertas al canal del equipo, transporte real
 *   por webhook si `ALERT_WEBHOOK_URL` está configurado, si no logger (E11-T2).
 * - `METRICS_REGISTRY`: métricas de salud del proceso (E11-T7).
 *
 * Y activa:
 * - `GlobalErrorCapture`: captura de `uncaughtException`/`unhandledRejection` → alerta (E11-T6).
 * - `QueueMonitorService`: vigila la cola OCR y alerta si se atasca (E11-T5).
 * - `HealthService`: readiness (DB/Redis) para el endpoint de salud (E11-T8).
 */
@Global()
@Module({
  imports: [OcrModule],
  providers: [
    {
      provide: APP_LOGGER,
      useFactory: () =>
        new StructuredLogger({
          context: { service: "workers", env: env.NODE_ENV },
          level: env.NODE_ENV === "development" ? "debug" : "info",
        }),
    },
    {
      provide: METRICS_REGISTRY,
      useValue: new MetricsRegistry(),
    },
    {
      provide: ALERT_DISPATCHER,
      inject: [APP_LOGGER],
      useFactory: (logger: StructuredLogger) => {
        const transport = buildAlertTransportFromEnv(
          { webhookUrl: env.ALERT_WEBHOOK_URL, webhookStyle: env.ALERT_WEBHOOK_STYLE },
          logger,
        );
        return new AlertDispatcher({ transport, logger });
      },
    },
    GlobalErrorCapture,
    QueueMonitorService,
    HealthService,
  ],
  exports: [APP_LOGGER, ALERT_DISPATCHER, METRICS_REGISTRY, HealthService],
})
export class ObservabilityModule {}
