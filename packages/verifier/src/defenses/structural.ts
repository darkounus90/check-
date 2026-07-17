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
// Rangos AMPLIOS: las referencias reales varían mucho (ej. Nequi "M27068114" = 9,
// Bancolombia Bre-B "TR5d3B0ZDhEC" = 12 alfanumérico). Esta defensa solo descarta formatos
// absurdos (muy cortos/largos o no alfanuméricos); la verificación fuerte es la Defensa 1
// (cruce con el correo del banco) y la Defensa 2 (base global de aprobaciones).
const APPROVAL_NUMBER_RULES: Readonly<Record<string, ApprovalNumberRule>> = {
  nequi: { minLength: 4, maxLength: 24 },
  bancolombia: { minLength: 4, maxLength: 24 },
  daviplata: { minLength: 4, maxLength: 24 },
  davivienda: { minLength: 4, maxLength: 24 },
  bbva: { minLength: 4, maxLength: 24 },
  banco_de_bogota: { minLength: 4, maxLength: 24 },
  colpatria: { minLength: 4, maxLength: 24 },
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
