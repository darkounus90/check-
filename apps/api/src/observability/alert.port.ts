import type { AlertEvent } from "@check/shared";

/**
 * Puerto mínimo para encolar una alerta (satisfecho por `AlertDispatcher` de `@check/shared`).
 * Los servicios que disparan alertas dependen de este contrato angosto y usan un mock en test.
 */
export interface AlertPort {
  dispatch(event: AlertEvent): Promise<void>;
}
