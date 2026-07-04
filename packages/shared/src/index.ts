import { z } from "zod";

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
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
