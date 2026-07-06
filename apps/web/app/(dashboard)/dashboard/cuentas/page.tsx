import { redirect } from "next/navigation";

import { defaultRouteForRole, getDashboardSession } from "@/lib/auth/session";
import { getReceivingAccounts, type ReceivingAccount } from "@/lib/data/accounts";
import { getMailboxStatus, type MailboxStatusResponse } from "@/lib/data/mailbox";

import { AccountsView } from "./accounts-view";

/**
 * Configuración de cuentas receptoras + onboarding del buzón (solo dueño) — E10-T8.
 * Protegido por rol: un cajero por URL directa es enviado a su vista por defecto. La
 * autoridad de escritura vive en la API (RolesGuard); aquí sólo se orquesta la UI.
 */
export default async function CuentasPage() {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "OWNER") {
    redirect(defaultRouteForRole(session.role));
  }

  let accounts: ReceivingAccount[] = [];
  let mailbox: MailboxStatusResponse | null = null;
  try {
    [accounts, mailbox] = await Promise.all([
      getReceivingAccounts().catch(() => []),
      getMailboxStatus().catch(() => null),
    ]);
  } catch {
    // Se degrada a estado vacío; la vista muestra sus propios avisos.
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cuentas</h1>
        <p className="mt-1 text-sm text-slate-600">
          Configura las cuentas donde recibes pagos y el buzón de reenvío de tu banco.
        </p>
      </div>
      <AccountsView initialAccounts={accounts} initialMailbox={mailbox} />
    </section>
  );
}
