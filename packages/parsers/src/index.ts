import { err, type Result } from "@check/shared";

import { bancolombiaV1 } from "./banks/bancolombia.v1.js";
import { bbvaV1 } from "./banks/bbva.v1.js";
import { daviviendaV1 } from "./banks/davivienda.v1.js";
import type { BankEmailParser, ParsedBankEmail } from "./types.js";

export type { BankEmailParser, ParsedBankEmail } from "./types.js";
export { bogotaToUtcIso, colombianAmountToCents } from "./util.js";

/**
 * Registro de parsers versionados por banco receptor (E04-T7).
 * Agregar un banco = añadir su parser aquí, sin tocar el dispatcher.
 */
export const bankEmailParserRegistry: readonly BankEmailParser[] = [
  bancolombiaV1,
  daviviendaV1,
  bbvaV1,
];

/** Dispatcher: selecciona el primer parser que reconoce el correo y lo parsea. */
export function parseBankEmail(rawEmail: string): Result<ParsedBankEmail> {
  for (const parser of bankEmailParserRegistry) {
    if (parser.matches(rawEmail)) return parser.parse(rawEmail);
  }
  return err("correo no reconocido por ningún parser");
}
