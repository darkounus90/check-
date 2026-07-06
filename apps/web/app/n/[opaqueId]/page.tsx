import type { Metadata } from "next";

type PageParams = {
  opaqueId: string;
};

type PageProps = {
  params: Promise<PageParams>;
};

// No se registra el opaqueId en logs (console, analytics, etc.). El titulo
// de la pestana se mantiene generico a proposito por la misma razon: el
// opaqueId es un identificador no enumerable (D3) y no debe terminar en
// historiales de navegacion, capturas de logs de terceros, etc.
export function generateMetadata(): Metadata {
  return {
    title: "CHECK · Comprobante",
  };
}

// Placeholder de E09-T1: esta ruta solo renderiza el shell publico sin
// sesion. La resolucion real del negocio a partir del opaqueId (BD) llega
// en E09-T2; el componente de captura/subida llega en E09-T3.
export default async function BusinessReceiptPage({ params }: PageProps) {
  const { opaqueId } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Comprobante para negocio {opaqueId}
      </h1>
      <p className="text-slate-600">
        Sube tu comprobante de pago y verifica su estado en tiempo real, sin
        necesidad de iniciar sesión.
      </p>
      <div className="w-full rounded-lg border border-dashed border-slate-300 p-10 text-sm text-slate-400">
        {/* Componente de captura/subida (camara o archivo): E09-T3 */}
        Próximamente: subir foto o PDF del comprobante
      </div>
    </main>
  );
}
