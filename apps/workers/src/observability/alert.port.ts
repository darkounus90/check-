import type { AlertEvent } from "@check/shared";

/**
 * Puerto mínimo para encolar una alerta (satisfecho por `AlertDispatcher` de `@check/shared`).
 * Permite que los servicios que disparan alertas (baneo, parser, cola) dependan de un contrato
 * angosto y usen un mock en test, en vez de la clase concreta del despachador.
 */
export interface AlertPort {
  dispatch(event: AlertEvent): Promise<void>;
}
