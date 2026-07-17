import { bogotaToUtcIso, colombianAmountToCents, err, ok } from "@check/shared";

import type { VoucherExtractor } from "./types.js";

const AMOUNT = /\$\s*([\d.]+(?:,\d{2})?)/;
/** Fecha numérica: "YYYY-MM-DD HH:mm" o "DD/MM/YYYY HH:mm" (fixtures sintéticos). */
const DATE_NUMERIC = /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|\d{2}\/\d{2}\/\d{4}[ T]\d{2}:\d{2})/;
/** Fecha en español largo, formato real de Nequi/DaviPlata: "16 de julio de 2026 a las 08:45 p. m." */
const DATE_ES =
  /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})[\s\S]{0,15}?(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i;

const MONTHS_ES: Readonly<Record<string, number>> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/**
 * Extrae la fecha/hora del comprobante a ISO UTC, tolerando dos formatos: el numérico
 * (fixtures) y el español largo con AM/PM (comprobantes reales de Nequi/DaviPlata).
 * Devuelve `undefined` si ningún formato coincide.
 */
function extractPaidAtUtc(t: string): string | undefined {
  const numeric = t.match(DATE_NUMERIC)?.[1];
  if (numeric) return bogotaToUtcIso(numeric);

  const es = t.match(DATE_ES);
  if (es) {
    const [, day, monthName, year, hourRaw, minute, ampm] = es;
    if (!day || !monthName || !year || !hourRaw || !minute || !ampm) return undefined;
    const month = MONTHS_ES[monthName.toLowerCase()];
    if (!month) return undefined;
    let hour = Number(hourRaw);
    const isPm = ampm.toLowerCase() === "p";
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    const pad = (n: number) => String(n).padStart(2, "0");
    return bogotaToUtcIso(`${year}-${pad(month)}-${pad(Number(day))} ${pad(hour)}:${minute}`);
  }
  return undefined;
}

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
      const paidAtUtc = extractPaidAtUtc(t);
      if (!amount || !approvalNumber || !paidAtUtc) {
        return err(`${c.bank}: faltan campos (monto/aprobación/fecha)`);
      }
      try {
        return ok({
          issuerBank: c.bank,
          amount: colombianAmountToCents(amount),
          approvalNumber,
          paidAtUtc,
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
  // Comprobante real de Nequi: "Referencia M27068114" (alfanumérico). Se acepta también
  // "Comprobante" por compatibilidad con layouts antiguos/otros.
  approval: /(?:Referencia|Comprobante)\s*([A-Za-z0-9]+)/i,
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
