import { type Cents, toCents } from "@check/shared";

/**
 * Convierte un monto en formato colombiano ("150.000,00") a centavos enteros.
 * Miles con ".", decimales con ",".
 */
export function colombianAmountToCents(raw: string): Cents {
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  const pesos = Number(normalized);
  if (!Number.isFinite(pesos)) throw new Error(`Monto inválido: ${raw}`);
  return toCents(Math.round(pesos * 100));
}

/**
 * Normaliza una fecha/hora local de Colombia (America/Bogota, UTC-5 fijo, sin DST)
 * a un ISO 8601 en UTC. Acepta "YYYY-MM-DD HH:mm" o "DD/MM/YYYY HH:mm".
 */
export function bogotaToUtcIso(dateStr: string): string {
  const iso = dateStr.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (iso) {
    const [, y, mo, d, h, mi] = iso;
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:00-05:00`).toISOString();
  }
  const dmy = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/);
  if (dmy) {
    const [, d, mo, y, h, mi] = dmy;
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:00-05:00`).toISOString();
  }
  throw new Error(`Fecha inválida: ${dateStr}`);
}
