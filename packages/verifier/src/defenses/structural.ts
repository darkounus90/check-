import { failSignal, notApplicableSignal, passSignal } from "../signal.js";
import type { Defense, DefenseInput, DefenseSignal } from "../types.js";

/** Identificador de esta defensa en `EvidenceSource`/`DefenseSignal`. */
export const STRUCTURAL_KIND = "structural";

/** Regla de formato del número de aprobación para un banco emisor concreto. */
interface ApprovalNumberRule {
  /** Longitud mínima aceptada (inclusive). */
  readonly minLength: number;
  /** Longitud máxima aceptada (inclusive). */
  readonly maxLength: number;
}

/**
 * Defensa 6 (E06-T8) — validación estructural del número de aprobación (D formato).
 *
 * Tabla de reglas por `issuerBank` (string literal que produce cada `VoucherExtractor`
 * de `packages/ocr/src/extractors.ts`, no un enum de `@check/database` — ver
 * `ExtractedVoucher.issuerBank` en `packages/ocr/src/types.ts`).
 *
 * **Importante — heurísticas, no especificación oficial:** todos los extractores
 * actuales capturan el número de aprobación con `(\d+)` (solo dígitos), así que la
 * regla "solo dígitos" es consistente con lo que el pipeline OCR ya produce hoy. Los
 * rangos de longitud, en cambio, se estimaron a partir de la longitud observada en el
 * único fixture sintético disponible por banco (`packages/ocr/test/fixtures/*.txt`,
 * marcados "FIXTURE SINTETICO"), con un margen amplio para no rechazar comprobantes
 * reales legítimos por un rango demasiado estrecho. Ningún banco publicó una
 * especificación oficial de formato/longitud consultada para esta tarea: estos rangos
 * deben refinarse cuando existan comprobantes reales o documentación oficial del
 * emisor.
 */
const APPROVAL_NUMBER_RULES: Readonly<Record<string, ApprovalNumberRule>> = {
  // Fixture: "Comprobante 1234567" (7 dígitos).
  nequi: { minLength: 6, maxLength: 10 },
  // Fixture: "Comprobante No. 998877" (6 dígitos).
  bancolombia: { minLength: 5, maxLength: 10 },
  // Fixture: "Referencia 55667788" (8 dígitos) — DaviPlata usa referencias más largas.
  daviplata: { minLength: 6, maxLength: 12 },
  // Fixture: "Aprobacion 123456" (6 dígitos).
  davivienda: { minLength: 5, maxLength: 10 },
  // Fixture: "Operacion 456789" (6 dígitos).
  bbva: { minLength: 5, maxLength: 10 },
  // Fixture: "Numero de aprobacion 7654321" (7 dígitos).
  banco_de_bogota: { minLength: 6, maxLength: 10 },
  // Fixture: "Aprobacion 246810" (6 dígitos).
  colpatria: { minLength: 5, maxLength: 10 },
};

// Los comprobantes reales usan referencias ALFANUMÉRICAS (ej. Nequi "M27068114"), no solo
// dígitos. Se valida formato alfanumérico + rango de longitud plausible por banco.
const ALPHANUMERIC = /^[A-Za-z0-9]+$/;

function evaluateStructural(input: DefenseInput): DefenseSignal {
  const { issuerBank, approvalNumber } = input.voucher;

  if (!issuerBank || !approvalNumber) {
    return notApplicableSignal(STRUCTURAL_KIND, {
      detail: "falta issuerBank o approvalNumber para validar el formato (no penaliza)",
    });
  }

  const rule = APPROVAL_NUMBER_RULES[issuerBank];
  if (!rule) {
    return notApplicableSignal(STRUCTURAL_KIND, {
      detail: `no hay regla de formato definida para el banco "${issuerBank}" (no penaliza)`,
    });
  }

  if (!ALPHANUMERIC.test(approvalNumber)) {
    return failSignal(STRUCTURAL_KIND, {
      detail: `número de aprobación "${approvalNumber}" contiene caracteres inválidos (no alfanuméricos) para ${issuerBank}`,
    });
  }

  const { length } = approvalNumber;
  if (length < rule.minLength || length > rule.maxLength) {
    return failSignal(STRUCTURAL_KIND, {
      detail: `número de aprobación de ${length} dígitos fuera del rango plausible para ${issuerBank} (${rule.minLength}-${rule.maxLength})`,
    });
  }

  return passSignal(STRUCTURAL_KIND, {
    detail: `formato de número de aprobación plausible para ${issuerBank}`,
  });
}

/** Defensa 6: validación estructural del número de aprobación según banco emisor. */
export const structuralDefense: Defense = {
  kind: STRUCTURAL_KIND,
  evaluate: evaluateStructural,
};
