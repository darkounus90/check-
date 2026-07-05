import { failSignal, passSignal } from "../signal.js";
import type { Defense, DefenseInput, DefenseSignal } from "../types.js";

/**
 * Defensa 7 (E06-T9): patrones sospechosos.
 *
 * Dos sub-señales previstas por el PRD de la épica; en el MVP solo una está activa
 * (D5, decisión resuelta con el dueño el 2026-07-03):
 *
 * 1. **Intentos fallidos repetidos del mismo cliente en la red (across-tenant)** —
 *    la parte "fuerte" de esta defensa. Si `DefenseContext.recentFailedAttemptsByClient`
 *    supera el umbral configurable (`BusinessDefenseConfig.failedAttemptsThreshold`,
 *    por defecto `DEFAULT_FAILED_ATTEMPTS_THRESHOLD`), se emite `fail`. Un valor
 *    `undefined` se trata como 0 intentos (no penaliza por falta de dato, mismo
 *    principio D4 que el resto de defensas).
 *
 * 2. **Horarios de operación por banco** — **intencionalmente NO implementada en el
 *    MVP** (D5: "los bancos operan transferencias 24/7; señal débil y volátil").
 *    Esta sub-señal queda apagada/pospuesta a una mejora post-MVP. No se cablea
 *    ninguna lógica que lea `DefenseContext.nowUtc` para comparar contra horarios
 *    por banco; esta defensa **nunca** produce `fail` por razones de horario en el
 *    MVP. Este comentario documenta la ausencia deliberada para que no se confunda
 *    con un olvido (ver test dedicado en `suspicious-patterns.test.ts` que blinda
 *    contra una regresión futura que reactive esta lógica sin querer).
 */

/** `kind` con el que esta defensa se identifica en `DefenseSignal`/`EvidenceSource`. */
export const SUSPICIOUS_PATTERNS_KIND = "suspicious_patterns";

/** Umbral por defecto de intentos fallidos si el negocio no configura uno propio. */
export const DEFAULT_FAILED_ATTEMPTS_THRESHOLD = 3;

/** Implementación de la Defensa 7: patrones sospechosos (solo sub-señal de intentos fallidos, D5). */
export const suspiciousPatternsDefense: Defense = {
  kind: SUSPICIOUS_PATTERNS_KIND,

  evaluate(input: DefenseInput): DefenseSignal {
    const { context } = input;
    const threshold = context.business.failedAttemptsThreshold ?? DEFAULT_FAILED_ATTEMPTS_THRESHOLD;
    const recentFailedAttempts = context.recentFailedAttemptsByClient ?? 0;

    if (recentFailedAttempts > threshold) {
      return failSignal(SUSPICIOUS_PATTERNS_KIND, {
        detail: `mismo cliente con ${recentFailedAttempts} intentos fallidos recientes en la red (umbral ${threshold})`,
      });
    }

    // Nota (D5): la sub-señal de "horarios de operación por banco" está apagada por
    // diseño en el MVP y no se evalúa aquí (ver comentario de módulo arriba). Este
    // `pass` es el único desenlace posible cuando no se supera el umbral anterior.
    return passSignal(SUSPICIOUS_PATTERNS_KIND);
  },
};
