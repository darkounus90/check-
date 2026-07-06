import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPublicBusiness, type PublicBusiness } from "@/lib/public-api";
import { getQrRoute, type QrRoute } from "@/lib/qr-route";

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

// ENRUTADOR de QR (Épica 8) + fallback a PWA (Épica 9). La misma URL
// `/n/{opaqueId}` es el destino del QR físico: server-side consultamos el
// enrutador público (GET /public/n/:opaqueId/route). Si hay un número WhatsApp
// sano del negocio (primario o failover a secundario), redirigimos a `wa.me`
// (E08-T1/T3). Si todo el pool del negocio está caído (`action=pwa`, E08-T4),
// caemos EXACTAMENTE a la PWA de subida de la Épica 9 que ya existía: se resuelve
// el negocio por su nombre y se renderiza `VoucherFlow` sin cambios.
export default async function BusinessReceiptPage({ params }: PageProps) {
  const { opaqueId } = await params;

  // 1) Enrutado: número sano → WhatsApp. `redirect()` lanza internamente, así que
  //    debe ir FUERA del try/catch (no queremos tratar el redirect como un fallo).
  let route: QrRoute | null = null;
  let routeFailed = false;
  try {
    route = await getQrRoute(opaqueId);
  } catch {
    // Error de red o del API resolviendo el enrutado: degradamos a la PWA (que
    // tiene su propio manejo de error). Sin loguear el opaqueId (D3).
    routeFailed = true;
  }

  if (route === null && !routeFailed) {
    // 404 explícito: enlace inválido, mismo mensaje que la PWA para no filtrar.
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Este enlace no es válido</h1>
        <p className="text-slate-600">
          Pide al negocio que te comparta de nuevo su enlace de verificación.
        </p>
      </main>
    );
  }

  if (route?.action === "whatsapp") {
    redirect(route.waMeUrl);
  }

  // 2) Fallback a la PWA (action=pwa o fallo de red): render intacto de la Épica 9.
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
