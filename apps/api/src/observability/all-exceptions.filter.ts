import { buildUnhandledErrorAlert, serializeError, type StructuredLogger } from "@check/shared";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
} from "@nestjs/common";

import type { AlertPort } from "./alert.port";
import { ALERT_DISPATCHER, APP_LOGGER } from "./observability.tokens";

/** Forma mínima de la respuesta HTTP (express) que este filtro usa. */
interface HttpResponseLike {
  status(code: number): { json(body: unknown): unknown };
}

/** Forma mínima de la request HTTP (express) que este filtro usa. */
interface HttpRequestLike {
  url?: string;
  method?: string;
}

/**
 * Filtro global de excepciones de la API (Épica 11, E11-T6).
 *
 * Toda excepción que llega al borde HTTP se registra en JSON estructurado. Las 5xx (errores
 * de servidor, no controlados) ADEMÁS se encolan como alerta al canal del equipo — nunca se
 * silencian. Las 4xx (errores de cliente esperados: validación, auth) se responden normal sin
 * alertar (no son fallos operacionales). La respuesta al cliente mantiene el shape de Nest.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(APP_LOGGER) private readonly logger: StructuredLogger,
    @Inject(ALERT_DISPATCHER) private readonly alerts: AlertPort,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponseLike>();
    const request = ctx.getRequest<HttpRequestLike>();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const path = request?.url ?? "unknown";
    const method = request?.method ?? "unknown";

    if (status >= 500) {
      // Error de servidor no controlado → log + alerta (anti-silencio).
      this.logger.error("excepción no manejada en la API", {
        method,
        path,
        status,
        error: serializeError(exception),
      });
      void this.alerts.dispatch(
        buildUnhandledErrorAlert(`api:${method} ${path}`, exception, { status }),
      );
    } else {
      // Error de cliente esperado: se registra a nivel warn, sin alerta.
      this.logger.warn("error de cliente en la API", {
        method,
        path,
        status,
        message: exception instanceof Error ? exception.message : String(exception),
      });
    }

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: 500, message: "Internal server error" };
    response.status(status).json(body);
  }
}
