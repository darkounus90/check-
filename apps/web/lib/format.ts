// Formateadores para el dashboard (Épica 10). Español colombiano neutro.

/** Formatea centavos como pesos colombianos (COP). Ej.: 1234567 → "$ 12.345,67". */
export function formatCents(amountCents: number): string {
  const value = amountCents / 100;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Fecha + hora legible (es-CO). Devuelve "—" para entradas inválidas. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}
