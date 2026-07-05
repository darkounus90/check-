import { failSignal, notApplicableSignal, passSignal } from "../signal.js";
import type { Defense, DefenseInput, DefenseSignal } from "../types.js";

const KIND = "time_window";

/**
 * Defensa 4 (E06-T6): ventana de tiempo estricta configurable por negocio.
 *
 * Distinta de la ventana de la Defensa 1 (esa cruza el comprobante contra el correo real
 * del banco receptor, ±15 min configurable, E06-T3). Esta defensa valida que el pago
 * (`voucher.paidAtUtc`) haya ocurrido dentro de una ventana de negocio más amplia
 * respecto a "ahora" (`context.nowUtc`) — ej. no aceptar comprobantes de hace más de
 * N horas/días. Reutiliza el mismo campo de configuración
 * `BusinessDefenseConfig.verificationWindowMinutes`, que `types.ts` ya documenta como
 * compartido entre Defensa 1 y Defensa 4.
 *
 * Reglas:
 * - Sin `context.nowUtc` o sin `verificationWindowMinutes` configurado → `not_applicable`
 *   (D4: falta de dato/configuración no penaliza).
 * - `paidAtUtc` o `nowUtc` no parseables como fecha ISO válida → `not_applicable`.
 * - Diferencia absoluta entre `nowUtc` y `paidAtUtc` mayor o igual a la ventana
 *   configurada → `fail` (fuera de ventana; el agregador ya garantiza que esto impide
 *   🟢 y produce 🚨, sin necesidad de que esta defensa marque `enablesGreen`).
 * - Dentro de la ventana → `pass`, sin `enablesGreen` (solo la Defensa 1 habilita 🟢).
 *
 * Determinista: usa únicamente `context.nowUtc` para "ahora", nunca `Date.now()` real
 * dentro de la lógica de evaluación (mismo principio de pureza que `state-machine.ts`).
 */
export const timeWindowDefense: Defense = {
  kind: KIND,
  evaluate(input: DefenseInput): DefenseSignal {
    const { voucher, context } = input;
    const windowMinutes = context.business.verificationWindowMinutes;

    if (context.nowUtc === undefined || windowMinutes === undefined) {
      return notApplicableSignal(KIND, {
        detail:
          "sin nowUtc o sin verificationWindowMinutes configurado; no se puede evaluar la ventana de tiempo",
      });
    }

    const nowMs = Date.parse(context.nowUtc);
    const paidMs = Date.parse(voucher.paidAtUtc);

    if (Number.isNaN(nowMs) || Number.isNaN(paidMs)) {
      return notApplicableSignal(KIND, {
        detail: "nowUtc o paidAtUtc no son fechas ISO válidas",
      });
    }

    const windowMs = windowMinutes * 60_000;
    const diffMs = Math.abs(nowMs - paidMs);

    if (diffMs >= windowMs) {
      return failSignal(KIND, {
        detail: `el comprobante fue pagado fuera de la ventana de ${windowMinutes} minutos configurada por el negocio (diferencia: ${Math.round(
          diffMs / 60_000,
        )} min)`,
      });
    }

    return passSignal(KIND, {
      detail: `comprobante pagado dentro de la ventana de ${windowMinutes} minutos configurada por el negocio`,
    });
  },
};
