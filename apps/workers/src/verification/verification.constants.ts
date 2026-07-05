/** Nombre de la cola BullMQ de verificación de comprobantes (E06-T12). */
export const VERIFICATION_QUEUE_NAME = "verification-processing";

/** Nombre del job dentro de la cola de verificación (misma para evaluación inicial y reintento;
 * se distinguen por la presencia de `pendingSinceUtc` en el payload, ver `verification.queue.ts`). */
export const VERIFICATION_JOB_NAME = "verify";

/** Token de inyección Nest para el reloj (`() => string` ISO UTC) del procesador de
 * verificación. Inyectable para tests deterministas (mismo principio que `nowUtc` en
 * `packages/verifier`); en producción se provee el reloj real (ver `verification.module.ts`). */
export const VERIFICATION_CLOCK = Symbol("VERIFICATION_CLOCK");
