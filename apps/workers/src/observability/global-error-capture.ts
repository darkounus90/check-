import {
  type AlertDispatcher,
  buildUnhandledErrorAlert,
  serializeError,
  type StructuredLogger,
} from "@check/shared";
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { ALERT_DISPATCHER, APP_LOGGER } from "./observability.tokens";

/**
 * Captura global de errores del proceso worker (Épica 11, E11-T6).
 *
 * Engancha `uncaughtException` y `unhandledRejection`: cualquier throw/rechazo que se
 * escape de un handler termina como ALERTA al canal del equipo y como log estructurado —
 * nunca como silencio. No mata el proceso por sí mismo (deja que el orquestador de procesos
 * decida), pero garantiza que el error quede registrado y notificado.
 */
@Injectable()
export class GlobalErrorCapture implements OnModuleInit, OnModuleDestroy {
  private readonly onUncaught = (error: Error): void => this.report("uncaughtException", error);
  private readonly onRejection = (reason: unknown): void =>
    this.report("unhandledRejection", reason);

  constructor(
    @Inject(APP_LOGGER) private readonly logger: StructuredLogger,
    @Inject(ALERT_DISPATCHER) private readonly alerts: AlertDispatcher,
  ) {}

  onModuleInit(): void {
    process.on("uncaughtException", this.onUncaught);
    process.on("unhandledRejection", this.onRejection);
  }

  onModuleDestroy(): void {
    process.off("uncaughtException", this.onUncaught);
    process.off("unhandledRejection", this.onRejection);
  }

  /** Loguea y encola la alerta. Público para poder dispararlo desde tests sin `process.emit`. */
  report(origin: string, error: unknown): void {
    this.logger.error(`error no manejado (${origin})`, { origin, error: serializeError(error) });
    void this.alerts.dispatch(buildUnhandledErrorAlert(`workers:${origin}`, error, { pid: process.pid }));
  }
}
