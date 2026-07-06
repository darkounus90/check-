/**
 * Tokens de inyección de la capa de observabilidad de la API (Épica 11).
 *
 * El logger estructurado, el despachador de alertas y el registro de métricas viven en
 * `@check/shared`. Aquí solo declaramos los tokens Nest para inyectar esas instancias.
 */

/** `StructuredLogger` compartido, contextualizado con `{ service: "api" }`. */
export const APP_LOGGER = Symbol("APP_LOGGER");

/** `AlertDispatcher` compartido (transporte real o logger según env). */
export const ALERT_DISPATCHER = Symbol("ALERT_DISPATCHER");

/** `MetricsRegistry` compartido del proceso API (E11-T7). */
export const METRICS_REGISTRY = Symbol("METRICS_REGISTRY");
