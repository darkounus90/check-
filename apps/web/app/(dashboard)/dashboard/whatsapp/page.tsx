import { redirect } from "next/navigation";

import { defaultRouteForRole, getDashboardSession } from "@/lib/auth/session";

import { WhatsappConnect } from "./whatsapp-connect";

/** Pantalla "Conectar WhatsApp" (solo dueño): muestra el QR para vincular el número. */
export default async function WhatsappPage() {
  const session = await getDashboardSession();
  if (!session) redirect("/login");
  if (session.role !== "OWNER") redirect(defaultRouteForRole(session.role));

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectar WhatsApp</h1>
        <p className="mt-1 text-sm text-slate-600">
          Vincula el WhatsApp del negocio para que el cajero pueda enviar comprobantes por chat y
          recibir el veredicto al instante.
        </p>
      </div>
      <WhatsappConnect />
    </section>
  );
}
