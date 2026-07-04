import type { Cents } from "@check/shared";

/**
 * Motor de verificación antifraude (las 7 defensas + semáforo).
 *
 * Placeholder de la Épica 1 (E01-T8): contratos `Defense`/`Verdict`.
 * Las 7 defensas reales, la máquina de estados del semáforo y la regla dura
 * "sin correo real del banco receptor, nunca 🟢" llegan en la Épica 6.
 */

/** Semáforo del veredicto. */
export type Verdict = "verified" | "pending" | "suspicious";

/** Contexto mínimo que evalúa una defensa (se enriquece en la Épica 6). */
export interface VerificationContext {
  readonly amount: Cents;
  readonly approvalNumber: string;
}

/** Señal producida por una defensa individual. */
export interface DefenseSignal {
  /** Peso/impacto de la señal en el agregado (placeholder). */
  readonly weight: number;
  /** true si esta defensa detectó algo sospechoso. */
  readonly suspicious: boolean;
  readonly reason: string;
}

/** Contrato de una defensa antifraude. */
export interface Defense {
  readonly name: string;
  evaluate(context: VerificationContext): DefenseSignal;
}

/** Registro de defensas. Vacío en el MVP inicial; se llena en la Épica 6. */
export const defenseRegistry: readonly Defense[] = [];
