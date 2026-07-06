/**
 * Política de retención de datos (Épica 12, E12-T3).
 *
 * Define POR TIPO DE DATO cuánto tiempo se conserva y calcula, dado un reloj inyectable, el
 * corte (`cutoff`) antes del cual las filas de ese tipo están fuera de la ventana y deben
 * purgarse. La ejecución real (borrado + traza) vive en el job de `apps/workers`; aquí solo la
 * política y el cálculo puro (testeable con reloj fijo, sin BD).
 *
 * Normativa: Colombia (Ley 1581/2012 habeas data) exige conservar datos solo por el tiempo
 * necesario para la finalidad. Las ventanas por defecto son conservadoras y configurables por
 * entorno (ver `RETENTION_*` en env). El log inmutable de operaciones con dinero
 * (`money_op_logs`) y la auditoría (`data_access_audits`) NO se purgan por defecto: son la
 * evidencia legal de las decisiones tomadas.
 */

/** Tipos de dato con política de retención propia. */
export type RetainedDataType =
  | "voucher" // comprobante + su artefacto en Storage (imagen/PDF, ocrText, PII)
  | "bankEmail" // correo bancario crudo entrante (PII, contenido sensible)
  | "qrResolutionLog" // traza analítica de resolución de QR
  | "waSession"; // auth-state de WhatsApp de números dados de baja / inactivos

/** Ventana de retención (en días) por tipo de dato. */
export type RetentionPolicy = Record<RetainedDataType, number>;

/** Ventanas por defecto (días). Conservadoras; configurables por entorno. */
export const DEFAULT_RETENTION_DAYS: RetentionPolicy = {
  voucher: 365, // 1 año: comprobantes y su PII
  bankEmail: 365, // 1 año: correos bancarios crudos
  qrResolutionLog: 180, // 6 meses: analítica operativa
  waSession: 90, // 3 meses: sesiones WhatsApp inactivas
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fecha de corte para un tipo: filas cuyo timestamp de referencia sea ANTERIOR a este corte
 * están fuera de la ventana de retención y son candidatas a purga. `now` inyectable ⇒ testeable.
 */
export function retentionCutoff(
  type: RetainedDataType,
  now: Date,
  policy: RetentionPolicy = DEFAULT_RETENTION_DAYS,
): Date {
  const days = policy[type];
  return new Date(now.getTime() - days * DAY_MS);
}

/** ¿Una fila con este timestamp de referencia está fuera de la ventana de retención? */
export function isBeyondRetention(
  type: RetainedDataType,
  referenceTimestamp: Date,
  now: Date,
  policy: RetentionPolicy = DEFAULT_RETENTION_DAYS,
): boolean {
  return referenceTimestamp.getTime() < retentionCutoff(type, now, policy).getTime();
}

/** Traza de un ciclo de purga (E12-T3): qué se purgó, de qué tipo, con qué corte y cuándo. */
export interface PurgeTraceEntry {
  readonly type: RetainedDataType;
  readonly cutoff: string; // ISO
  readonly purgedCount: number;
  readonly purgedAt: string; // ISO
}

/** Construye una entrada de traza para el log estructurado / persistencia de auditoría. */
export function buildPurgeTrace(
  type: RetainedDataType,
  cutoff: Date,
  purgedCount: number,
  now: Date,
): PurgeTraceEntry {
  return {
    type,
    cutoff: cutoff.toISOString(),
    purgedCount,
    purgedAt: now.toISOString(),
  };
}

/**
 * Construye una política a partir de overrides parciales (p. ej. desde variables de entorno),
 * cayendo a los defaults para los tipos no configurados.
 */
export function resolveRetentionPolicy(overrides: Partial<RetentionPolicy>): RetentionPolicy {
  return { ...DEFAULT_RETENTION_DAYS, ...pruneUndefined(overrides) };
}

function pruneUndefined(obj: Partial<RetentionPolicy>): Partial<RetentionPolicy> {
  const out: Partial<RetentionPolicy> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as RetainedDataType] = v;
  }
  return out;
}
