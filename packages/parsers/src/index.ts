import type { Cents, Result } from "@check/shared";

/**
 * Parsers de correos bancarios versionados por banco receptor.
 *
 * Placeholder de la Épica 1 (E01-T6): contrato + registro vacío.
 * Los parsers reales (Bancolombia, Davivienda, BBVA) llegan en la Épica 4,
 * cada uno versionado (`v1`, `v2`) y con fixtures de regresión.
 */

/** Datos estructurados extraídos de un correo transaccional del banco receptor. */
export interface ParsedBankEmail {
  readonly bank: string;
  readonly amount: Cents;
  readonly approvalNumber: string;
  /** Instante de la transacción en UTC (ISO 8601). */
  readonly occurredAtUtc: string;
  /** Cuenta destino tal como aparece en el correo (puede venir enmascarada). */
  readonly destinationAccount: string;
}

/** Contrato de un parser de correo bancario, versionado. */
export interface BankEmailParser {
  /** Identificador del banco receptor (p. ej. "bancolombia"). */
  readonly bank: string;
  /** Versión del parser (p. ej. "v1"). */
  readonly version: string;
  /** Devuelve true si este parser reconoce el correo. */
  matches(rawEmail: string): boolean;
  /** Extrae los datos estructurados del correo. */
  parse(rawEmail: string): Result<ParsedBankEmail>;
}

/** Registro de parsers. Vacío en el MVP inicial; se llena en la Épica 4 sin refactor del core. */
export const bankEmailParserRegistry: readonly BankEmailParser[] = [];
