import type { ExtractedVoucher } from "@check/ocr";
import type { ParsedBankEmail } from "@check/parsers";

import { failSignal, notApplicableSignal, passSignal } from "../signal.js";
import type { Defense, DefenseInput, DefenseSignal } from "../types.js";

/**
 * Defensa 1 (E06-T3): cruce con correo real del banco receptor.
 *
 * Confirma que el comprobante extraído (`ExtractedVoucher`) corresponde a una
 * transferencia efectivamente recibida, cruzándolo contra los correos bancarios ya
 * parseados (`DefenseContext.receivedBankEmails`). Es la **única** defensa de las 7
 * que emite `enablesGreen: true` (regla dura de la épica, ver `types.ts` y
 * `aggregate.ts`): sin esta defensa en `pass`, el veredicto nunca es `VERIFIED` (🟢).
 *
 * Decisión de producto (E06-T10, integración final): esta defensa distingue dos
 * situaciones muy distintas que antes colapsaban en el mismo `fail`:
 * - **Todavía no ha llegado ningún correo** (`receivedBankEmails.length === 0`): no es
 *   evidencia de fraude, es simplemente que el banco receptor aún no notificó la
 *   operación. Se modela como `not_applicable` (conservando `enablesGreen: true`)
 *   para que el agregador (`aggregate.ts`) produzca `PENDING` — el estado que
 *   `state-machine.ts` (E06-T2) ya sabe reintentar dentro de la ventana de espera —
 *   y nunca `SUSPICIOUS` solo por timing.
 * - **Llegaron correos pero ninguno matchea** este comprobante (monto/aprobación/
 *   cuenta/ventana): sí es una señal fuerte de fraude (comprobante falso o alterado
 *   frente a lo que el banco realmente reportó) y se mantiene como `fail`, llevando
 *   el veredicto a `SUSPICIOUS` vía la regla "cualquier fail gana" del agregador.
 */

/** `kind` con el que esta defensa se identifica en `DefenseSignal`/`EvidenceSource`. */
export const BANK_EMAIL_MATCH_KIND = "bank_email_match";

/** Ventana de tiempo por defecto (minutos) si el negocio no configura una propia. */
const DEFAULT_WINDOW_MINUTES = 15;

function isWithinWindow(paidAtUtc: string, occurredAtUtc: string, windowMinutes: number): boolean {
  const paidAtMs = Date.parse(paidAtUtc);
  const occurredAtMs = Date.parse(occurredAtUtc);
  if (Number.isNaN(paidAtMs) || Number.isNaN(occurredAtMs)) {
    return false;
  }
  const diffMs = Math.abs(paidAtMs - occurredAtMs);
  return diffMs <= windowMinutes * 60_000;
}

function isMatch(
  voucher: ExtractedVoucher,
  email: ParsedBankEmail,
  windowMinutes: number,
): boolean {
  return (
    email.amount === voucher.amount &&
    email.approvalNumber === voucher.approvalNumber &&
    email.destinationAccount === voucher.destinationAccount &&
    isWithinWindow(voucher.paidAtUtc, email.occurredAtUtc, windowMinutes)
  );
}

/** Implementación de la Defensa 1: cruce con correo real del banco receptor. */
export const emailMatchDefense: Defense = {
  kind: BANK_EMAIL_MATCH_KIND,
  evaluate(input: DefenseInput): DefenseSignal {
    const { voucher, context } = input;
    const windowMinutes = context.business.verificationWindowMinutes ?? DEFAULT_WINDOW_MINUTES;

    const matchingEmail = context.receivedBankEmails.find((email) =>
      isMatch(voucher, email, windowMinutes),
    );

    if (matchingEmail) {
      return passSignal(BANK_EMAIL_MATCH_KIND, {
        enablesGreen: true,
        detail: `correo real del banco receptor confirma monto, número de aprobación ${matchingEmail.approvalNumber} y cuenta destino dentro de ±${windowMinutes} min`,
      });
    }

    if (context.receivedBankEmails.length === 0) {
      return notApplicableSignal(BANK_EMAIL_MATCH_KIND, {
        enablesGreen: true,
        detail:
          "todavía no se recibió ningún correo real del banco receptor (PENDING: se reintentará dentro de la ventana de espera, no es evidencia de fraude por sí sola)",
      });
    }

    return failSignal(BANK_EMAIL_MATCH_KIND, {
      enablesGreen: true,
      detail: `ningún correo recibido coincide en monto/aprobación/cuenta destino dentro de ±${windowMinutes} min`,
    });
  },
};
