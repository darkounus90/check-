import { err, ok } from "@check/shared";

import type { BankEmailParser } from "../types.js";
import { bogotaToUtcIso, colombianAmountToCents } from "../util.js";

/** Parser del correo de abono de Bancolombia (banco receptor). Fixtures: test/fixtures/bancolombia-*. */
export const bancolombiaV1: BankEmailParser = {
  bank: "bancolombia",
  version: "v1",
  matches: (raw) => /bancolombia/i.test(raw),
  parse: (raw) => {
    const amount = raw.match(/\$\s*([\d.]+,\d{2})/)?.[1];
    const approvalNumber = raw.match(/Comprobante\s*No\.?\s*(\d+)/i)?.[1];
    const account = raw.match(/\*(\d{3,4})/)?.[1];
    const dateRaw = raw.match(/Fecha:\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})/i)?.[1];
    if (!amount || !approvalNumber || !dateRaw) {
      return err("bancolombia: faltan campos (monto/comprobante/fecha)");
    }
    try {
      return ok({
        bank: "bancolombia",
        amount: colombianAmountToCents(amount),
        approvalNumber,
        occurredAtUtc: bogotaToUtcIso(dateRaw),
        destinationAccount: account ?? "",
      });
    } catch (e) {
      return err(`bancolombia: ${(e as Error).message}`);
    }
  },
};
