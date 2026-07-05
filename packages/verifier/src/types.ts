import type { ExtractedVoucher } from "@check/ocr";
import type { ParsedBankEmail } from "@check/parsers";

/**
 * Contrato del motor de verificación antifraude (Épica 6, E06-T1).
 *
 * Cada `Defense` evalúa el mismo comprobante+contexto y produce una `DefenseSignal`
 * independiente. El agregador (`runDefenses`, ver `aggregate.ts`) combina esas señales
 * en un único `Verdict`, aplicando desde ya la regla dura de la épica:
 * **sin una defensa marcada `enablesGreen` que pase (Defensa 1 — cruce con correo real
 * del banco receptor, E06-T3), el veredicto nunca puede ser `VERIFIED` (🟢).**
 */

/** Configuración del negocio relevante para las defensas (cuenta declarada, ventanas, umbrales). */
export interface BusinessDefenseConfig {
  readonly businessId: string;
  /** Últimos 4 dígitos de la cuenta declarada por el negocio (D4, Defensa 3). */
  readonly declaredAccountLast4?: string;
  /** Nombre del beneficiario declarado por el negocio (D4, Defensa 3). */
  readonly declaredBeneficiary?: string;
  /** Ventana de tiempo (minutos) para cruzar comprobante vs. correo (Defensa 1/4). */
  readonly verificationWindowMinutes?: number;
}

/**
 * Contexto disponible además del comprobante extraído. Se modela lo mínimo necesario
 * para el contrato del agregador (E06-T1); las defensas reales (E06-T3..T9) lo consumen
 * y pueden requerir campos adicionales que se agregarán en esas tareas sin romper esta forma.
 */
export interface DefenseContext {
  readonly business: BusinessDefenseConfig;
  /** Correos bancarios recibidos y parseados, candidatos a cruzar con este comprobante (Defensa 1). */
  readonly receivedBankEmails: readonly ParsedBankEmail[];
  /** `true` si el número de aprobación ya existe en la red global, solo-existencia (D6, Defensa 2). */
  readonly approvalNumberSeenGlobally?: boolean;
  /** Intentos fallidos recientes del mismo cliente en la red (Defensa 7, D5). */
  readonly recentFailedAttemptsByClient?: number;
  /**
   * Momento (ISO UTC) en que se evalúa la verificación, inyectado por el llamador
   * (worker, E06-T12) — nunca `Date.now()` real dentro de una `Defense`, mismo principio
   * de pureza que `state-machine.ts`. Lo usan las defensas que comparan contra el reloj
   * actual (ej. Defensa 4 — ventana estricta configurable, E06-T6; Defensa 7 — horarios
   * por banco, apagado en MVP, D5).
   */
  readonly nowUtc?: string;
}

/** Entrada de una `Defense`: el comprobante ya extraído (Épica 5) + el contexto del negocio. */
export interface DefenseInput {
  readonly voucher: ExtractedVoucher;
  readonly context: DefenseContext;
  /**
   * Bytes crudos de la imagen/PDF del comprobante (mismo formato `Uint8Array` que
   * `OcrProvider`/`normalizeImage` en `@check/ocr`), necesarios para el análisis técnico
   * de imagen (Defensa 5 — ELA, EXIF, doble compresión, resolución/proporción, E06-T7),
   * que no puede operar solo con el texto ya extraído (`ExtractedVoucher`). Opcional
   * porque el resto de defensas no lo necesitan; si falta, la Defensa 5 debe emitir
   * `not_applicable` (D4: no penaliza por falta de dato) en vez de `fail`.
   */
  readonly imageBytes?: Uint8Array;
}

/** Resultado de evaluar una defensa: pasa, falla, o no aplica (no penaliza — ver D4). */
export type DefenseOutcome = "pass" | "fail" | "not_applicable";

/** Señal ponderada que produce una defensa al evaluar un `DefenseInput`. */
export interface DefenseSignal {
  /** Identificador de la defensa (ej. "bank_email", "global_approval", "image_ela"). */
  readonly kind: string;
  readonly outcome: DefenseOutcome;
  /**
   * Confianza/peso de la señal en `[0, 1]`. Reservado para combinar señales débiles
   * en tareas futuras (D4 — "suma confianza"); ignorado por el agregador si
   * `outcome === "not_applicable"`.
   */
  readonly weight: number;
  /** `true` únicamente en la defensa que habilita 🟢 (Defensa 1, E06-T3). */
  readonly enablesGreen: boolean;
  /** Detalle legible para auditoría (se guarda en `EvidenceSource.detail`). */
  readonly detail?: string;
}

/** Contrato que implementa cada una de las 7 defensas (E06-T3..T9). */
export interface Defense {
  readonly kind: string;
  evaluate(input: DefenseInput): DefenseSignal | Promise<DefenseSignal>;
}

/**
 * Estado del semáforo. Coincide en valores con el enum `VerdictStatus` de Prisma
 * (`packages/database/prisma/schema.prisma`) para que E06-T11 lo persista sin mapeo.
 */
export type VerdictStatus = "VERIFIED" | "PENDING" | "SUSPICIOUS";

/**
 * Forma compatible con el modelo Prisma `EvidenceSource` (campos `kind`/`passed`/`detail`),
 * para que E06-T11 escriba `MoneyOpLog`/`Transaction`/`EvidenceSource` sin transformación.
 */
export interface EvidenceSource {
  readonly kind: string;
  readonly passed: boolean;
  readonly detail?: string;
}

/** Veredicto agregado de todas las defensas evaluadas para un comprobante. */
export interface Verdict {
  readonly status: VerdictStatus;
  readonly evidenceSources: readonly EvidenceSource[];
  /** Motivo legible del veredicto (para auditoría/soporte). */
  readonly reason: string;
}
