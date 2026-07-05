import { failSignal, notApplicableSignal, passSignal } from "../signal.js";
import type { Defense, DefenseInput, DefenseSignal } from "../types.js";

/**
 * Defensa 3 — coincidencia de cuenta destino (E06-T5, D4).
 *
 * Compara el `destinationAccount`/`beneficiary` del comprobante extraído (OCR, Épica 5)
 * contra lo declarado por el negocio (`DefenseContext.business.declaredAccountLast4` /
 * `declaredBeneficiary`, ya definidos en el contrato `BusinessDefenseConfig` de `types.ts`
 * desde E06-T1 — no fue necesario extender el contrato para esta tarea).
 *
 * Regla D4 (match flexible):
 * - Coincide por **últimos 4 dígitos de cuenta** y/o por **nombre de beneficiario**
 *   (comparación normalizada: minúsculas, sin acentos, espacios colapsados) → `pass`,
 *   suma confianza (`weight > 0`), nunca `enablesGreen` (esa es exclusiva de la Defensa 1).
 * - Si no hay dato legible para comparar (ni cuenta ni beneficiario, del lado del
 *   comprobante o del lado de lo declarado por el negocio) → `not_applicable`.
 *   **Nunca penaliza por sí sola** — no debe bajar el veredicto a 🚨.
 * - Si hay dato legible en ambos lados pero **no coincide** → `fail` (baja el veredicto;
 *   el agregador ya trata cualquier `fail` sin `enablesGreen` como `SUSPICIOUS`).
 */

const DEFENSE_KIND = "account_match";

/** Deja solo dígitos y toma los últimos 4 (para comparar cuentas de distinto largo/formato). */
function last4Digits(raw: string): string | undefined {
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.length > 0 ? digitsOnly.slice(-4) : undefined;
}

/** Normaliza un nombre para comparación difusa: minúsculas, sin acentos, espacios colapsados. */
function normalizeName(raw: string): string | undefined {
  const normalized = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : undefined;
}

/** `true` si un nombre normalizado coincide (exacto o uno contiene al otro) con el otro. */
function namesMatch(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

function evaluateAccountMatch(input: DefenseInput): DefenseSignal {
  const { voucher, context } = input;
  const { business } = context;

  const voucherAccountLast4 = last4Digits(voucher.destinationAccount);
  const declaredAccountLast4 = business.declaredAccountLast4
    ? last4Digits(business.declaredAccountLast4)
    : undefined;

  const voucherBeneficiary = normalizeName(voucher.beneficiary);
  const declaredBeneficiary = business.declaredBeneficiary
    ? normalizeName(business.declaredBeneficiary)
    : undefined;

  const canCompareAccount = voucherAccountLast4 !== undefined && declaredAccountLast4 !== undefined;
  const canCompareBeneficiary =
    voucherBeneficiary !== undefined && declaredBeneficiary !== undefined;

  if (!canCompareAccount && !canCompareBeneficiary) {
    return notApplicableSignal(DEFENSE_KIND, {
      detail: "sin dato legible de cuenta destino ni beneficiario para comparar (D4: no penaliza)",
    });
  }

  const accountMatches =
    canCompareAccount && voucherAccountLast4 === declaredAccountLast4;
  const beneficiaryMatches =
    canCompareBeneficiary && namesMatch(voucherBeneficiary as string, declaredBeneficiary as string);

  if (accountMatches || beneficiaryMatches) {
    const matchedBy = [
      accountMatches ? "últimos 4 dígitos de cuenta" : undefined,
      beneficiaryMatches ? "nombre de beneficiario" : undefined,
    ]
      .filter((v): v is string => v !== undefined)
      .join(" y ");
    return passSignal(DEFENSE_KIND, {
      weight: 0.6,
      detail: `coincide por ${matchedBy} con lo declarado por el negocio`,
    });
  }

  return failSignal(DEFENSE_KIND, {
    weight: 0.6,
    detail: "cuenta destino y beneficiario del comprobante no coinciden con lo declarado por el negocio",
  });
}

/** Defensa 3: coincidencia de cuenta destino / beneficiario (match flexible, D4). */
export const accountMatchDefense: Defense = {
  kind: DEFENSE_KIND,
  evaluate: evaluateAccountMatch,
};
