import { bogotaToUtcIso, colombianAmountToCents, err, ok } from "@check/shared";

import type { VoucherExtractor } from "./types.js";

const AMOUNT = /\$\s*([\d.]+(?:,\d{2})?)/;
const DATE = /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|\d{2}\/\d{2}\/\d{4}[ T]\d{2}:\d{2})/;

interface Config {
  bank: string;
  version: string;
  match: RegExp;
  approval: RegExp;
  account: RegExp;
  beneficiary?: RegExp;
}

/** Fábrica de extractores: un banco emisor = una config, sin duplicar lógica (E05-T5..T11). */
function build(c: Config): VoucherExtractor {
  return {
    issuerBank: c.bank,
    version: c.version,
    matches: (t) => c.match.test(t),
    extract: (t) => {
      const amount = t.match(AMOUNT)?.[1];
      const approvalNumber = t.match(c.approval)?.[1];
      const account = t.match(c.account)?.[1];
      const beneficiary = c.beneficiary ? t.match(c.beneficiary)?.[1]?.trim() : "";
      const dateRaw = t.match(DATE)?.[1];
      if (!amount || !approvalNumber || !dateRaw) {
        return err(`${c.bank}: faltan campos (monto/aprobación/fecha)`);
      }
      try {
        return ok({
          issuerBank: c.bank,
          amount: colombianAmountToCents(amount),
          approvalNumber,
          paidAtUtc: bogotaToUtcIso(dateRaw),
          destinationAccount: account ?? "",
          beneficiary: beneficiary ?? "",
        });
      } catch (e) {
        return err(`${c.bank}: ${(e as Error).message}`);
      }
    },
  };
}

const NAME = /a\s+([A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚñáéíóú]+(?:\s+[A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚñáéíóú]+)+)/;
const BENEF = /Beneficiario:?\s*([A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚñáéíóú ]+)/i;
const PARA = /Para:?\s*([A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚñáéíóú ]+)/i;
const CUENTA = /Cuenta\s*(\d{3,})/i;
const PHONE = /\b(3\d{9})\b/;

export const nequiV1 = build({
  bank: "nequi",
  version: "v1",
  match: /nequi/i,
  approval: /Comprobante\s*(\d+)/i,
  account: PHONE,
  beneficiary: NAME,
});

export const bancolombiaVoucherV1 = build({
  bank: "bancolombia",
  version: "v1",
  match: /bancolombia/i,
  approval: /Comprobante\s*No\.?\s*(\d+)/i,
  account: CUENTA,
  beneficiary: PARA,
});

export const daviplataV1 = build({
  bank: "daviplata",
  version: "v1",
  match: /daviplata/i,
  approval: /Referencia\s*(\d+)/i,
  account: PHONE,
});

export const daviviendaVoucherV1 = build({
  bank: "davivienda",
  version: "v1",
  match: /davivienda/i,
  approval: /Aprobaci[oó]n\s*(\d+)/i,
  account: CUENTA,
  beneficiary: BENEF,
});

export const bbvaVoucherV1 = build({
  bank: "bbva",
  version: "v1",
  match: /bbva/i,
  approval: /Operaci[oó]n\s*(\d+)/i,
  account: /terminada en\s*(\d{3,4})/i,
  beneficiary: NAME,
});

export const bancoBogotaV1 = build({
  bank: "banco_de_bogota",
  version: "v1",
  match: /banco de bogot[aá]/i,
  approval: /aprobaci[oó]n\s*(\d+)/i,
  account: CUENTA,
  beneficiary: PARA,
});

export const colpatriaV1 = build({
  bank: "colpatria",
  version: "v1",
  match: /colpatria/i,
  approval: /Aprobaci[oó]n\s*(\d+)/i,
  account: CUENTA,
  beneficiary: BENEF,
});
