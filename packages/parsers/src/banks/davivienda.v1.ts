import { err, ok } from "@check/shared";

import type { BankEmailParser } from "../types.js";
import { bogotaToUtcIso, colombianAmountToCents } from "../util.js";

/** Parser del correo de abono de Davivienda (banco receptor). Fixtures: test/fixtures/davivienda-*. */
export const daviviendaV1: BankEmailParser = {
  bank: "davivienda",
  version: "v1",
  matches: (raw) => /davivienda/i.test(raw),
  parse: (raw) => {
    const amount = raw.match(/\$\s*([\d.]+,\d{2})/)?.[1];
    const approvalNumber = raw.match(/Referencia\s*(\d+)/i)?.[1];
    const account = raw.match(/cuenta\s*(\d{3,})/i)?.[1];
    const dateRaw = raw.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/)?.[1];
    if (!amount || !approvalNumber || !dateRaw) {
      return err("davivienda: faltan campos (monto/referencia/fecha)");
    }
    try {
      return ok({
        bank: "davivienda",
        amount: colombianAmountToCents(amount),
        approvalNumber,
        occurredAtUtc: bogotaToUtcIso(dateRaw),
        destinationAccount: account ?? "",
      });
    } catch (e) {
      return err(`davivienda: ${(e as Error).message}`);
    }
  },
};
