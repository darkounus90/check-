import { err, ok } from "@check/shared";

import type { BankEmailParser } from "../types.js";
import { bogotaToUtcIso, colombianAmountToCents } from "../util.js";

/** Parser del correo de abono de BBVA (banco receptor). Fixtures: test/fixtures/bbva-*. */
export const bbvaV1: BankEmailParser = {
  bank: "bbva",
  version: "v1",
  matches: (raw) => /bbva/i.test(raw),
  parse: (raw) => {
    const amount = raw.match(/\$\s*([\d.]+,\d{2})/)?.[1];
    const approvalNumber = raw.match(/operaci[oó]n\s*(\d+)/i)?.[1];
    const account = raw.match(/terminada en\s*(\d{3,4})/i)?.[1];
    const dateRaw = raw.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/)?.[1];
    if (!amount || !approvalNumber || !dateRaw) {
      return err("bbva: faltan campos (monto/operación/fecha)");
    }
    try {
      return ok({
        bank: "bbva",
        amount: colombianAmountToCents(amount),
        approvalNumber,
        occurredAtUtc: bogotaToUtcIso(dateRaw),
        destinationAccount: account ?? "",
      });
    } catch (e) {
      return err(`bbva: ${(e as Error).message}`);
    }
  },
};
