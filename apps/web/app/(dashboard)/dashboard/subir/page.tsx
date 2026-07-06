import { redirect } from "next/navigation";

import { ComingSoon } from "@/app/(dashboard)/coming-soon";
import { getDashboardSession } from "@/lib/auth/session";

/**
 * Vista "Subir comprobante" (cajero y dueño). Contenido real en E10-T3.
 * Placeholder para que la navegación funcione.
 */
export default async function SubirPage() {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <ComingSoon
      title="Subir comprobante"
      description="Desde aquí subirás el comprobante de pago y verás su verificación en vivo."
    />
  );
}
