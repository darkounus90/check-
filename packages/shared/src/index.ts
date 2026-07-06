import { z } from "zod";

/**
 * Observabilidad (Épica 11): logger estructurado, cola/despachador de alertas,
 * métricas de salud, health/readiness y constructores de alertas. Reexportados aquí
 * de forma ADITIVA para que api/workers los consuman desde `@check/shared`.
 */
export * from "./alert-triggers.js";
export * from "./alerts.js";
export * from "./health.js";
export * from "./logger.js";
export * from "./metrics.js";
export * from "./parser-failure-tracker.js";

/**
 * Hardening de seguridad y cumplimiento (Épica 12): cifrado en reposo (crypto), política de
 * retención (retention), auditoría inmutable (audit) y consentimiento/aviso de privacidad
 * (consent). Reexportados de forma ADITIVA para api/workers/web.
 */
export * from "./audit.js";
export * from "./consent.js";
export * from "./crypto.js";
export * from "./retention.js";

/**
 * Tipos y utilidades compartidas del monorepo CHECK.
 *
 * Convenciones (ver .trellis/spec/prd.md):
 * - El dinero SIEMPRE se representa en centavos como entero (`Cents`). Nunca float.
 * - Las fechas se guardan en UTC; se muestran en `America/Bogota`.
 *
 * Placeholder de la Épica 1 (E01-T4): contratos base sin lógica de negocio.
 */

/** Zona horaria de presentación (los datos se guardan en UTC). */
export const DISPLAY_TIMEZONE = "America/Bogota" as const;

/** Entero de centavos. Marca de tipo para no confundir con montos en unidades. */
export type Cents = number & { readonly __brand: "Cents" };

/** Construye un `Cents` a partir de un entero. Lanza si no es entero >= 0. */
export function toCents(value: number): Cents {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Cents debe ser un entero >= 0, recibido: ${value}`);
  }
  return value as Cents;
}

/** Schema Zod de un monto en centavos (entero no negativo). */
export const CentsSchema = z
  .number()
  .int()
  .nonnegative()
  .transform((n) => n as Cents);

/** Resultado tipado para operaciones que pueden fallar sin excepción. */
export type Result<T, E = string> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/**
 * Convierte un monto en formato colombiano ("150.000,00") a centavos enteros.
 * Miles con ".", decimales con ",". Acepta también enteros sin decimales ("150.000").
 */
export function colombianAmountToCents(raw: string): Cents {
  const trimmed = raw.trim();
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed.replace(/\./g, "");
  const pesos = Number(normalized);
  if (!Number.isFinite(pesos)) throw new RangeError(`Monto inválido: ${raw}`);
  return toCents(Math.round(pesos * 100));
}

/**
 * Normaliza una fecha/hora local de Colombia (America/Bogota, UTC-5 fijo, sin DST)
 * a un ISO 8601 en UTC. Acepta "YYYY-MM-DD HH:mm" o "DD/MM/YYYY HH:mm".
 */
export function bogotaToUtcIso(dateStr: string): string {
  const iso = dateStr.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (iso) {
    const [, y, mo, d, h, mi] = iso;
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:00-05:00`).toISOString();
  }
  const dmy = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/);
  if (dmy) {
    const [, d, mo, y, h, mi] = dmy;
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:00-05:00`).toISOString();
  }
  throw new RangeError(`Fecha inválida: ${dateStr}`);
}
