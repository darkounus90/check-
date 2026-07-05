import type { Verdict } from "./types.js";

/**
 * Máquina de estados del semáforo (E06-T2): evoluciona un `Verdict` ya emitido en
 * `PENDING` (🟡) mientras se espera el correo real del banco receptor (Defensa 1,
 * E06-T3), aplicando una ventana de tiempo configurable.
 *
 * Pura por diseño: no hace I/O, no toca BD/colas (eso es del worker, E06-T12) y no lee
 * el reloj real — el "ahora" y el momento en que se emitió el `PENDING` se reciben
 * siempre como parámetros (timestamps ISO UTC), para que sea 100% determinista en tests.
 */

/** Ventana de espera del correo del banco para un veredicto `PENDING` concreto. */
export interface PendingWindow {
  /** Momento (ISO UTC) en que el agregador emitió por primera vez el `PENDING`. */
  readonly pendingSinceUtc: string;
  /** Minutos de espera antes de expirar (ver `BusinessDefenseConfig.verificationWindowMinutes`). */
  readonly windowMinutes: number;
}

/** `true` si, al momento `nowUtc`, la ventana de espera del correo ya expiró. */
export function isPendingWindowExpired(window: PendingWindow, nowUtc: string): boolean {
  const pendingSinceMs = Date.parse(window.pendingSinceUtc);
  const nowMs = Date.parse(nowUtc);
  const windowMs = window.windowMinutes * 60_000;
  return nowMs - pendingSinceMs >= windowMs;
}

/**
 * Resuelve el estado final de un veredicto `PENDING` dado el resultado de reintentar
 * el agregador (`runDefenses`/`aggregateSignals`) con el contexto actualizado.
 *
 * Reglas (E06-T2):
 * - Si `retryVerdict` ya no es `PENDING` (el agregador dio `VERIFIED` o `SUSPICIOUS`),
 *   ese es el estado final: el agregador manda.
 * - Si `retryVerdict` sigue `PENDING` y la ventana no expiró, se mantiene `PENDING`
 *   (el llamador debe reintentar más tarde).
 * - Si `retryVerdict` sigue `PENDING` y la ventana expiró, transiciona a `SUSPICIOUS`:
 *   expiración sin correo real del banco receptor = sospechoso.
 */
export function resolvePendingVerdict(
  window: PendingWindow,
  nowUtc: string,
  retryVerdict: Verdict,
): Verdict {
  if (retryVerdict.status !== "PENDING") {
    return retryVerdict;
  }

  if (isPendingWindowExpired(window, nowUtc)) {
    return {
      status: "SUSPICIOUS",
      evidenceSources: retryVerdict.evidenceSources,
      reason:
        "la ventana de espera del correo real del banco receptor (Defensa 1) expiró sin confirmación",
    };
  }

  return retryVerdict;
}

/** Veredicto `PENDING` vigente, junto con el momento en que se emitió por primera vez. */
export interface PendingVerificationState {
  readonly verdict: Verdict;
  readonly pendingSinceUtc: string;
}

/**
 * Reintento de evaluación: vuelve a correr el agregador con el contexto actualizado
 * (ej. ya llegó el correo del banco) y produce un nuevo `Verdict`. Lo inyecta el
 * llamador (worker, E06-T12); esta máquina de estados no lo ejecuta por sí misma más
 * que para orquestar la decisión final.
 */
export type RetryEvaluation = () => Verdict | Promise<Verdict>;

/**
 * Conveniencia para el worker (E06-T12): dado un veredicto `PENDING` vigente, la
 * ventana configurada, el momento actual y un reintento de evaluación, produce el
 * `Verdict` final aplicando `resolvePendingVerdict`.
 *
 * Requiere `state.verdict.status === "PENDING"`; se lanza si se invoca sobre un
 * veredicto ya resuelto, para detectar errores de uso temprano.
 */
export async function retryPendingVerification(
  state: PendingVerificationState,
  windowMinutes: number,
  nowUtc: string,
  retryEvaluation: RetryEvaluation,
): Promise<Verdict> {
  if (state.verdict.status !== "PENDING") {
    throw new Error(
      `retryPendingVerification solo aplica sobre veredictos PENDING, recibido: ${state.verdict.status}`,
    );
  }

  const retryVerdict = await retryEvaluation();
  return resolvePendingVerdict(
    { pendingSinceUtc: state.pendingSinceUtc, windowMinutes },
    nowUtc,
    retryVerdict,
  );
}
