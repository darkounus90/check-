import { bogotaToUtcIso, colombianAmountToCents, err, ok } from "@check/shared";

import type { VoucherExtractor } from "./types.js";

const AMOUNT = /\$\s*([\d.]+(?:,\d{2})?)/;
/** Fecha numérica: "YYYY-MM-DD HH:mm" o "DD/MM/YYYY HH:mm" (fixtures sintéticos). */
const DATE_NUMERIC = /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|\d{2}\/\d{2}\/\d{4}[ T]\d{2}:\d{2})/;
/**
 * Fecha en español con AM/PM, tolerante a dos layouts reales:
 * - Nequi/DaviPlata:  "16 de julio de 2026 a las 08:45 p. m."  (mes completo, con "de")
 * - Bancolombia:      "03 Jul 2026 - 12:17 a. m."               (mes abreviado, sin "de")
 */
const DATE_ES =
  /(\d{1,2})\s+(?:de\s+)?([a-záéíóú]{3,})\.?\s+(?:de\s+)?(\d{4})[\s\S]{0,20}?(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i;

const MONTHS_ES: Readonly<Record<string, number>> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4,
  mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7, agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
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
  /** Regex de monto propia del banco (grupo 1 = valor). Si se omite, usa `AMOUNT` genérico. */
  amount?: RegExp;
}

/** Fábrica de extractores: un banco emisor = una config, sin duplicar lógica (E05-T5..T11). */
function build(c: Config): VoucherExtractor {
  return {
    issuerBank: c.bank,
    version: c.version,
    matches: (t) => c.match.test(t),
    extract: (t) => {
      const amount = t.match(c.amount ?? AMOUNT)?.[1];
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
/** Nombre bajo "Producto destino" (Bancolombia): línea siguiente con el titular. */
const PRODUCTO_DESTINO_NAME = /Producto\s+destino\s+([A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚñáéíóú ]+)/i;
/** Cuenta destino Bancolombia "453 - 970280 - 31" → captura los tres bloques con guiones. */
const CUENTA_BANCOLOMBIA = /(\d{3}\s*-\s*\d{5,7}\s*-\s*\d{2})/;
/** Monto Bancolombia anclado a "Valor de la transferencia" (evita tomar el "Costo $ 0,00"). */
const VALOR_BANCOLOMBIA = /Valor de la transferencia\s*\$\s*([\d.]+(?:,\d{2})?)/i;

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
  // El comprobante real de Bancolombia NO trae la palabra "bancolombia" (el logo es imagen).
  // Se detecta por su terminología propia "Producto destino/origen".
  match: /bancolombia|producto\s+(?:destino|origen)/i,
  approval: /Comprobante\s*No\.?\s*(\d+)/i,
  amount: VALOR_BANCOLOMBIA,
  account: CUENTA_BANCOLOMBIA,
  beneficiary: PRODUCTO_DESTINO_NAME,
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
