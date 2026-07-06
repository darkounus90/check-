import type { ReactNode } from "react";

/** Bloque "próximamente" para las vistas cuyo contenido real llega en otra ola. */
export function ComingSoon({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Próximamente.
      </div>
      {children}
    </section>
  );
}
