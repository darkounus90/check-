import type { Metadata } from "next";

import { getPublicBusiness, type PublicBusiness } from "@/lib/public-api";

import { VoucherFlow } from "./voucher-flow";

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

// Ruta pública sin login (Épica 9). El negocio se resuelve server-side vía
// el API público (GET /public/n/:opaqueId); al cliente solo se le pasa el
// nombre del negocio y el opaqueId que ya está en su URL. La captura/subida
// y el resultado en vivo viven en el client component VoucherFlow
// (E09-T3/E09-T5).
export default async function BusinessReceiptPage({ params }: PageProps) {
  const { opaqueId } = await params;

  let business: PublicBusiness | null = null;
  let loadFailed = false;

  try {
    business = await getPublicBusiness(opaqueId);
  } catch {
    // Error de red o del API: mensaje genérico, sin filtrar detalles ni
    // loguear el opaqueId (D3). Los estados de error finos son E09-T6.
    loadFailed = true;
  }

  if (loadFailed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          No pudimos cargar esta página
        </h1>
        <p className="text-slate-600">Revisa tu conexión e intenta de nuevo en unos segundos.</p>
      </main>
    );
  }

  if (!business) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Este enlace no es válido</h1>
        <p className="text-slate-600">
          Pide al negocio que te comparta de nuevo su enlace de verificación.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
        <p className="text-slate-600">
          Sube tu comprobante de pago y mira el resultado de la verificación aquí mismo, sin
          iniciar sesión.
        </p>
      </header>
      <VoucherFlow opaqueId={opaqueId} businessName={business.name} />
    </main>
  );
}
