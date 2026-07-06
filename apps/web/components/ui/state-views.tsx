import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Primitivas de estado compartidas (E10-T9): carga, vacío y error. Todas las vistas del
 * dashboard (cajero y dueño) las usan para tener un lenguaje visual consistente y
 * responsive. Mensajes en español; nunca se filtran detalles técnicos.
 */

/** Contenedor de tarjeta discreto y responsive usado por las vistas de estado. */
function StatePanel({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-300 bg-slate-50 text-slate-500",
      )}
    >
      {children}
    </div>
  );
}

/** Bloque de carga con placeholders animados. */
export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <StatePanel>
      <span className="animate-pulse text-2xl" aria-hidden="true">
        ⏳
      </span>
      <p aria-live="polite">{label}</p>
    </StatePanel>
  );
}

/** Estado vacío con título opcional y descripción. */
export function EmptyState({
  title,
  description,
  icon = "📭",
}: {
  title: string;
  description?: string;
  icon?: string;
}) {
  return (
    <StatePanel>
      <span className="text-2xl" aria-hidden="true">
        {icon}
      </span>
      <p className="font-medium text-slate-700">{title}</p>
      {description ? <p className="text-slate-500">{description}</p> : null}
    </StatePanel>
  );
}

/** Estado de error con acción de reintento opcional. */
export function ErrorState({
  title = "No pudimos cargar esta información",
  description = "Revisa tu conexión e intenta de nuevo en unos segundos.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <StatePanel tone="error">
      <span className="text-2xl" aria-hidden="true">
        ⚠️
      </span>
      <p className="font-medium">{title}</p>
      <p>{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </StatePanel>
  );
}

/** Fila de esqueleto animado, reutilizable en tablas/listas mientras cargan. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-10 w-full animate-pulse rounded-md bg-slate-100", className)}
      aria-hidden="true"
    />
  );
}
