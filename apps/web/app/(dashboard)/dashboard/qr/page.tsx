import { redirect } from "next/navigation";

import { defaultRouteForRole, getDashboardSession } from "@/lib/auth/session";
import { type BusinessQr,getBusinessQr } from "@/lib/data/business-qr";

import { QrView } from "./qr-view";

/**
 * QR imprimible del negocio (E08-T6, solo dueño). El QR apunta al enrutador estable
 * `/n/{opaqueId}` que resuelve al número WhatsApp sano en cada escaneo (o cae a la PWA).
 * Protegido por rol: un cajero por URL directa es enviado a su vista por defecto. La autoridad
 * vive en la API (`GET /me/qr`, RolesGuard OWNER); aquí solo se orquesta la UI.
 */
export default async function QrPage() {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "OWNER") {
    redirect(defaultRouteForRole(session.role));
  }

  let qr: BusinessQr | null = null;
  try {
    qr = await getBusinessQr();
  } catch {
    // Se degrada a aviso; no rompe el resto del dashboard.
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Código QR</h1>
        <p className="mt-1 text-sm text-slate-600">
          Imprime este QR y ponlo donde tus clientes pagan. Al escanearlo abren WhatsApp con tu
          número; si tus números no están disponibles, verán la página de subida de comprobante.
        </p>
      </div>
      {qr ? (
        <QrView qr={qr} />
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No pudimos generar tu código QR ahora mismo. Intenta de nuevo en unos segundos.
        </p>
      )}
    </section>
  );
}
