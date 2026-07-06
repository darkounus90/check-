/**
 * Motor de warmeo de números nuevos (E07-T6). Un número recién dado de alta no puede enviar
 * a tope desde el día 1 (WhatsApp lo banearía): su volumen se escala gradualmente y solo
 * entra al pool tras una ventana de calentamiento.
 *
 * Escalado de volumen (límite de envíos por hora, según antigüedad del número):
 * - Día 1 (primeras 24h):        20/h
 * - Semana 2 (día 7 en adelante): 60/h
 * - Tras 14 días (warmeo done):   200/h
 * - Entre día 1 y día 7:          se mantiene el escalón previo (20/h) hasta cruzar el hito.
 *
 * Elegibilidad de pool: un número entra al pool SOLO cuando completó los 14 días de warmeo
 * (`isPoolEligible`). El pool real (E07-T7) es otra ola; aquí solo el motor + el predicado.
 *
 * Diseño testeable: todo depende de un `now` (epoch ms) inyectado y del estado persistido
 * del número (`WarmupState`); no hay `Date.now()` interno. Los conteos por ventana horaria
 * se llevan en el estado (`hourWindowStart` + `sentInWindow`), de modo que `registerSend`
 * es una transición pura de estado dado `now`.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Hitos del escalado (en ms desde el alta del número). */
const WEEK_2_START_MS = 7 * DAY_MS; // día 7
const WARMUP_DONE_MS = 14 * DAY_MS; // día 14 (fin de warmeo)

/** Límites de envío por hora en cada escalón del warmeo. */
export const WARMUP_HOURLY_LIMITS = {
  /** Día 1–6: arranque suave. */
  day1: 20,
  /** Día 7–13: volumen medio. */
  week2: 60,
  /** Día 14+: volumen pleno (warmeo completado). */
  full: 200,
} as const;

/** Duración total de la ventana de warmeo antes de que el número sea elegible para pool. */
export const WARMUP_WINDOW_MS = WARMUP_DONE_MS;

/**
 * Estado de warmeo persistido por número (subconjunto de `WaNumber` + contador de ventana).
 * Mapea a: `WaNumber.warmupStartedAt` (fecha de alta/inicio del warmeo) y los campos de
 * conteo horario `warmupHourWindowStart` / `warmupSentInWindow` añadidos por migración.
 */
export interface WarmupState {
  /**
   * Momento (epoch ms) en que empezó el warmeo del número (su "alta"). `null` = aún no
   * arrancó (número creado pero nunca conectado/warmeado): se trata como no-elegible y en el
   * escalón más bajo hasta que se fije.
   */
  warmupStartedAtMs: number | null;
  /** Inicio (epoch ms) de la ventana horaria actual de conteo. `null` = sin envíos aún. */
  hourWindowStartMs: number | null;
  /** Envíos realizados dentro de la ventana horaria actual. */
  sentInWindow: number;
}

/** Milisegundos transcurridos desde el alta del número, o `null` si aún no arrancó. */
function ageMs(state: WarmupState, now: number): number | null {
  if (state.warmupStartedAtMs == null) return null;
  return now - state.warmupStartedAtMs;
}

/**
 * Límite de envíos por hora vigente para el número en `now`, según su antigüedad (E07-T6).
 * Sin `warmupStartedAt` (número que aún no arrancó warmeo) se aplica el escalón más bajo.
 */
export function hourlyLimit(state: WarmupState, now: number): number {
  const age = ageMs(state, now);
  if (age == null) return WARMUP_HOURLY_LIMITS.day1;
  if (age >= WARMUP_DONE_MS) return WARMUP_HOURLY_LIMITS.full;
  if (age >= WEEK_2_START_MS) return WARMUP_HOURLY_LIMITS.week2;
  return WARMUP_HOURLY_LIMITS.day1;
}

/**
 * Cuántos envíos lleva el número en la ventana horaria que contiene `now`. Si la ventana
 * guardada expiró (pasó ≥ 1h desde su inicio, o no hay ventana), el conteo efectivo es 0.
 */
function sentInCurrentWindow(state: WarmupState, now: number): number {
  if (state.hourWindowStartMs == null) return 0;
  if (now - state.hourWindowStartMs >= HOUR_MS) return 0; // ventana expirada
  return state.sentInWindow;
}

/**
 * ¿Puede el número enviar UN mensaje más en `now` sin exceder su límite horario? (E07-T6).
 * No muta el estado; es un predicado puro. `registerSend` debe llamarse tras un envío real.
 */
export function canSend(state: WarmupState, now: number): boolean {
  return sentInCurrentWindow(state, now) < hourlyLimit(state, now);
}

/**
 * Registra un envío en `now`, devolviendo el NUEVO estado de warmeo (transición pura). Si la
 * ventana horaria expiró (o no existía), abre una ventana nueva empezando en `now` con
 * conteo 1; si sigue vigente, incrementa el conteo. No decide si el envío era permitido: eso
 * es responsabilidad de `canSend` antes de enviar.
 */
export function registerSend(state: WarmupState, now: number): WarmupState {
  const windowExpired =
    state.hourWindowStartMs == null || now - state.hourWindowStartMs >= HOUR_MS;
  if (windowExpired) {
    return { ...state, hourWindowStartMs: now, sentInWindow: 1 };
  }
  return { ...state, sentInWindow: state.sentInWindow + 1 };
}

/**
 * ¿Completó el número su ventana de warmeo (14 días) y por tanto es elegible para el pool?
 * (E07-T6). Un número sin `warmupStartedAt` o dentro de la ventana NO es elegible. El pool
 * real que usa este predicado es E07-T7.
 */
export function isPoolEligible(state: WarmupState, now: number): boolean {
  const age = ageMs(state, now);
  return age != null && age >= WARMUP_WINDOW_MS;
}
