/**
 * Constructores puros de alertas operacionales y evaluadores de umbral (Épica 11, T3/T4/T5).
 *
 * Mantener la lógica de "cuándo disparar" y "con qué contexto" en funciones puras la hace
 * trivialmente testeable (sin BullMQ, sin Baileys, sin BD). Los adaptadores en apps/ solo
 * recopilan los datos y llaman a estos constructores → `AlertDispatcher.dispatch`.
 */

import type { AlertEvent } from "./alerts.js";

// ── E11-T3: baneo de número WhatsApp ────────────────────────────────

export interface NumberBannedContext {
  readonly waNumberId: string;
  readonly phoneNumber?: string;
  /** Cuántos negocios dependían de este número (para dimensionar el impacto). */
  readonly affectedBusinesses: number;
  /** ¿Hay al menos un número sano de reemplazo en el pool para esos negocios? */
  readonly hasReplacement: boolean;
  /** Ids de números de reemplazo disponibles (si los hay). */
  readonly replacementNumberIds?: readonly string[];
}

/**
 * Construye la alerta de baneo con contexto accionable: qué número, cuántos negocios
 * afectaba, si hay reemplazo y si hace falta warmear uno nuevo (cuando no hay reemplazo,
 * un número nuevo entra en warmeo antes de servir).
 */
export function buildNumberBannedAlert(ctx: NumberBannedContext): AlertEvent {
  return {
    kind: "whatsapp_number_banned",
    severity: ctx.hasReplacement ? "warning" : "critical",
    title: `Número WhatsApp baneado: ${ctx.phoneNumber ?? ctx.waNumberId}`,
    context: {
      waNumberId: ctx.waNumberId,
      ...(ctx.phoneNumber ? { phoneNumber: ctx.phoneNumber } : {}),
      affectedBusinesses: ctx.affectedBusinesses,
      hasReplacement: ctx.hasReplacement,
      needsWarmup: !ctx.hasReplacement,
      ...(ctx.replacementNumberIds && ctx.replacementNumberIds.length > 0
        ? { replacementNumberIds: ctx.replacementNumberIds }
        : {}),
    },
  };
}

// ── E11-T4: parser que deja de matchear ─────────────────────────────

export interface ParserFailureWindow {
  /** Total de correos/comprobantes en la tanda evaluada. */
  readonly total: number;
  /** Cuántos cayeron en "no reconocido" por ningún parser. */
  readonly unrecognized: number;
  /** Desglose de no reconocidos por banco/etiqueta detectada ("desconocido" si ninguno). */
  readonly byBank?: Readonly<Record<string, number>>;
  /** Fuente de la tanda (correo bancario vs. comprobante OCR). */
  readonly source: "bank_email" | "voucher_ocr";
}

export interface ParserAlertThresholds {
  /** Mínimo de items en la tanda para evaluar (evita ruido con muestras chicas). Def. 5. */
  readonly minSample?: number;
  /** Fracción de fallo (0..1) que dispara la alerta. Def. 0.5. */
  readonly failureRate?: number;
}

/**
 * Decide si una tanda de correos/comprobantes con demasiados "no reconocidos" debe
 * disparar alerta. Devuelve el `AlertEvent` o `null` si no supera el umbral. Puro.
 */
export function evaluateParserFailure(
  window: ParserFailureWindow,
  thresholds: ParserAlertThresholds = {},
): AlertEvent | null {
  const minSample = thresholds.minSample ?? 5;
  const failureRate = thresholds.failureRate ?? 0.5;
  if (window.total < minSample) return null;
  const rate = window.total === 0 ? 0 : window.unrecognized / window.total;
  if (rate < failureRate) return null;

  return {
    kind: "parser_match_failure",
    severity: rate >= 0.9 ? "critical" : "warning",
    title: `Parser dejó de matchear (${window.source}): ${window.unrecognized}/${window.total} no reconocidos`,
    context: {
      source: window.source,
      total: window.total,
      unrecognized: window.unrecognized,
      failureRate: Number(rate.toFixed(3)),
      ...(window.byBank ? { byBank: window.byBank } : {}),
    },
  };
}

// ── E11-T5: colas atascadas (BullMQ) ────────────────────────────────

export interface QueueDepthSnapshot {
  readonly queue: string;
  /** Jobs en espera (backlog). */
  readonly waiting: number;
  /** Jobs actualmente en proceso. */
  readonly active: number;
  /** Jobs fallidos acumulados. */
  readonly failed: number;
  /** Edad (ms) del job en espera más antiguo (0 si no hay). */
  readonly oldestWaitingMs: number;
}

export interface QueueAlertThresholds {
  /** Backlog máximo tolerado antes de alertar. Def. 100. */
  readonly maxWaiting?: number;
  /** Jobs fallidos máximos tolerados. Def. 20. */
  readonly maxFailed?: number;
  /** Edad máxima (ms) del job más antiguo antes de alertar. Def. 300000 (5 min). */
  readonly maxOldestWaitingMs?: number;
}

/**
 * Evalúa una foto de la cola contra los umbrales. Devuelve alerta si CUALQUIER umbral se
 * supera (con el motivo listado), o `null` si la cola está sana. Puro.
 */
export function evaluateQueueDepth(
  snapshot: QueueDepthSnapshot,
  thresholds: QueueAlertThresholds = {},
): AlertEvent | null {
  const maxWaiting = thresholds.maxWaiting ?? 100;
  const maxFailed = thresholds.maxFailed ?? 20;
  const maxOldestWaitingMs = thresholds.maxOldestWaitingMs ?? 300_000;

  const reasons: string[] = [];
  if (snapshot.waiting > maxWaiting) reasons.push(`backlog ${snapshot.waiting} > ${maxWaiting}`);
  if (snapshot.failed > maxFailed) reasons.push(`fallidos ${snapshot.failed} > ${maxFailed}`);
  if (snapshot.oldestWaitingMs > maxOldestWaitingMs) {
    reasons.push(
      `job más antiguo ${Math.round(snapshot.oldestWaitingMs / 1000)}s > ${Math.round(maxOldestWaitingMs / 1000)}s`,
    );
  }
  if (reasons.length === 0) return null;

  return {
    kind: "queue_stuck",
    severity: snapshot.oldestWaitingMs > maxOldestWaitingMs * 2 ? "critical" : "warning",
    title: `Cola atascada: ${snapshot.queue}`,
    context: {
      queue: snapshot.queue,
      waiting: snapshot.waiting,
      active: snapshot.active,
      failed: snapshot.failed,
      oldestWaitingMs: snapshot.oldestWaitingMs,
      reasons,
    },
  };
}

// ── E11-T6: excepción no manejada ───────────────────────────────────

/** Construye la alerta de un error no manejado (captura global). */
export function buildUnhandledErrorAlert(
  origin: string,
  error: unknown,
  extra?: Record<string, unknown>,
): AlertEvent {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: "unhandled_error",
    severity: "critical",
    title: `Error no manejado en ${origin}: ${message}`,
    context: {
      origin,
      message,
      ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      ...(extra ?? {}),
    },
  };
}
