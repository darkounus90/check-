import { failSignal, notApplicableSignal, passSignal } from "../signal.js";
import type { Defense, DefenseInput, DefenseSignal } from "../types.js";

/** Identificador de esta defensa en `EvidenceSource`/`DefenseSignal`. */
export const GLOBAL_APPROVALS_KIND = "global_approval";

/**
 * Defensa 2 (E06-T4) — base global de números de aprobación (D6).
 *
 * El contrato `DefenseContext.approvalNumberSeenGlobally` ya llega **precalculado**
 * por quien invoque el motor (el llamador ejecuta antes la función de BD de
 * alcance restringido de la Épica 2, E02-T11, que responde solo "existe/no existe"
 * cross-tenant sin revelar de qué negocio provino). Esta defensa no consulta BD:
 * solo interpreta ese booleano.
 *
 * Reglas:
 * - `true` (número ya visto en la red) → `fail`, sin excepciones. Reutilizar un
 *   número de aprobación es la señal de fraude más dura de la épica (🚨), y no se
 *   pondera contra otras señales: cualquier reutilización invalida el comprobante.
 * - `false` (no visto) → `pass`. Esta defensa nunca marca `enablesGreen`: no ser
 *   Defensa 1, no habilita 🟢 por sí sola (esa regla es exclusiva de E06-T3).
 * - `undefined` (el llamador no pudo verificar, ej. la consulta a la función de BD
 *   falló o no se ejecutó) → `not_applicable`. Se elige explícitamente no penalizar
 *   por un dato faltante, extendiendo aquí el principio D4 ("ilegible no penaliza")
 *   a "no verificable no penaliza": la ausencia del dato no es evidencia de fraude,
 *   y penalizar por una falla de infraestructura del llamador degradaría el
 *   veredicto de comprobantes legítimos sin relación con el fraude real. El costo
 *   de este criterio (un número reutilizado podría colarse si su verificación
 *   falla silenciosamente) se acepta porque la regla dura de la épica ya exige
 *   Defensa 1 en positivo para 🟢, y un `undefined` aquí nunca produce VERIFIED
 *   por sí solo.
 */
export const globalApprovalsDefense: Defense = {
  kind: GLOBAL_APPROVALS_KIND,

  evaluate(input: DefenseInput): DefenseSignal {
    const seenGlobally = input.context.approvalNumberSeenGlobally;

    if (seenGlobally === true) {
      return failSignal(GLOBAL_APPROVALS_KIND, {
        detail: "número de aprobación ya usado en otro comprobante de la red",
      });
    }

    if (seenGlobally === false) {
      return passSignal(GLOBAL_APPROVALS_KIND);
    }

    return notApplicableSignal(GLOBAL_APPROVALS_KIND, {
      detail: "no se pudo verificar la base global de aprobaciones",
    });
  },
};
