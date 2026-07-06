import type { VerdictStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/**
 * Metadatos del semáforo antifraude (E10-T4/T6/T7). Un único lugar donde vive la
 * correspondencia veredicto → emoji + etiqueta + colores, para que todas las vistas
 * (estado en vivo, histórico, alertas) sean consistentes.
 */
export const VERDICT_META: Record<
  VerdictStatus,
  { emoji: string; label: string; badge: string; dot: string }
> = {
  VERIFIED: {
    emoji: "🟢",
    label: "Verificado",
    badge: "bg-green-50 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  PENDING: {
    emoji: "🟡",
    label: "Pendiente",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  SUSPICIOUS: {
    emoji: "🚨",
    label: "Sospechoso",
    badge: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
};

/** Píldora con el estado del veredicto (emoji + etiqueta). */
export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: VerdictStatus;
  className?: string;
}) {
  const meta = VERDICT_META[verdict];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        meta.badge,
        className,
      )}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.label}
    </span>
  );
}
