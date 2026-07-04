import type { Cents, Result } from "@check/shared";

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

/** Contrato de un parser de correo bancario, versionado por banco receptor. */
export interface BankEmailParser {
  readonly bank: string;
  readonly version: string;
  matches(rawEmail: string): boolean;
  parse(rawEmail: string): Result<ParsedBankEmail>;
}
