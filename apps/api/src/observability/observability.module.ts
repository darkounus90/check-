import {
  AlertDispatcher,
  buildAlertTransportFromEnv,
  MetricsRegistry,
  StructuredLogger,
} from "@check/shared";
import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { env } from "../env";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import { HealthService } from "./health.service";
import { ALERT_DISPATCHER, APP_LOGGER, METRICS_REGISTRY } from "./observability.tokens";

/**
 * Capa de observabilidad de la API (Épica 11).
 *
 * Provee (`@Global`) el logger estructurado (E11-T1), el despachador de alertas (E11-T2) y el
 * registro de métricas (E11-T7). Registra `AllExceptionsFilter` como filtro GLOBAL (`APP_FILTER`)
 * para que toda excepción no controlada termine en log + alerta (E11-T6), y expone `HealthService`
 * para el `HealthController` (E11-T8).
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_LOGGER,
      useFactory: () =>
        new StructuredLogger({
          context: { service: "api", env: env.NODE_ENV },
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
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    HealthService,
  ],
  exports: [APP_LOGGER, ALERT_DISPATCHER, METRICS_REGISTRY, HealthService],
})
export class ObservabilityModule {}
