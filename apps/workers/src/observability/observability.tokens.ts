/**
 * Tokens de inyección de la capa de observabilidad de los workers (Épica 11).
 *
 * El logger estructurado, el despachador de alertas y el registro de métricas viven en
 * `@check/shared` (ESM, testeable). Aquí solo declaramos los tokens Nest para inyectar esas
 * instancias como providers en el árbol de módulos de los workers.
 */

/** `StructuredLogger` compartido, contextualizado con `{ service: "workers" }`. */
export const APP_LOGGER = Symbol("APP_LOGGER");

/** `AlertDispatcher` compartido (transporte real o logger según env). */
export const ALERT_DISPATCHER = Symbol("ALERT_DISPATCHER");

/** `MetricsRegistry` compartido del proceso workers (E11-T7). */
export const METRICS_REGISTRY = Symbol("METRICS_REGISTRY");
