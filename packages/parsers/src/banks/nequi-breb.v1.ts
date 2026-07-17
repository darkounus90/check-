import { colombianAmountToCents, err, ok } from "@check/shared";

import type { BankEmailParser } from "../types.js";
import { bogotaToUtcIso } from "../util.js";

const MONTHS_ES: Readonly<Record<string, number>> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4,
  mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7, agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};

/** Convierte "18 de junio de 2026 a las 12:28 p.m" a ISO UTC. `undefined` si no matchea. */
function spanishDateToUtc(raw: string): string | undefined {
  const m = raw.match(
    /(\d{1,2})\s+(?:de\s+)?([a-záéíóú]{3,})\.?\s+(?:de\s+)?(\d{4})[\s\S]{0,20}?(\d{1,2}):(\d{2})\s*([ap])\.?\s*m/i,
  );
  if (!m) return undefined;
  const [, day, monthName, year, hourRaw, minute, ampm] = m;
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

/**
 * Parser del aviso **Bre-B de Nequi** (banco receptor "ligero").
 *
 * A diferencia de los bancos tradicionales, el aviso Bre-B NO trae número de referencia
 * ni cuenta destino — solo monto, fecha y nombre del pagador
 * ("Recibiste 8.700 de NOMBRE el 18 de junio de 2026 a las 12:28 p.m"). Por eso
 * `approvalNumber`/`destinationAccount` quedan vacíos y la Defensa 1 (email-match.ts) los
 * cruza por **monto + tiempo** para estos correos ligeros. Para el flujo de producción se
 * usan bancos tradicionales cuyos correos SÍ traen la referencia (ver PRD).
 */
export const nequiBreBV1: BankEmailParser = {
  bank: "nequi",
  version: "breb-v1",
  matches: (raw) => /nequi/i.test(raw) && /bre-?b/i.test(raw),
  parse: (raw) => {
    const amount = raw.match(/Recibiste\s+([\d.]+(?:,\d{2})?)/i)?.[1];
    const occurredAtUtc = spanishDateToUtc(raw);
    if (!amount || !occurredAtUtc) {
      return err("nequi/bre-b: faltan campos (monto/fecha)");
    }
    try {
      return ok({
        bank: "nequi",
        amount: colombianAmountToCents(amount),
        approvalNumber: "",
        occurredAtUtc,
        destinationAccount: "",
      });
    } catch (e) {
      return err(`nequi/bre-b: ${(e as Error).message}`);
    }
  },
};
