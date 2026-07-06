"use client";

import { useState, useTransition } from "react";

import {
  createAccountAction,
  deleteAccountAction,
  refetchAccountsAction,
  refreshMailboxAction,
} from "@/app/(dashboard)/actions";
import { useNotifications } from "@/app/(dashboard)/notifications";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state-views";
import type { ReceiverBank, ReceivingAccount } from "@/lib/data/accounts";
import type { MailboxStatusResponse } from "@/lib/data/mailbox";

/**
 * Configuración de cuentas receptoras + estado del buzón de reenvío (E10-T8).
 * Escritura (crear/eliminar cuenta, refrescar buzón) sólo para el dueño, vía Server
 * Actions que la API valida server-side (RolesGuard). La UI refleja el rol pero la
 * autoridad está en el backend.
 */

const BANK_OPTIONS: { value: ReceiverBank; label: string }[] = [
  { value: "BANCOLOMBIA", label: "Bancolombia" },
  { value: "DAVIVIENDA", label: "Davivienda" },
  { value: "BBVA", label: "BBVA" },
];

function bankLabel(bank: ReceiverBank): string {
  return BANK_OPTIONS.find((option) => option.value === bank)?.label ?? bank;
}

export function AccountsView({
  initialAccounts,
  initialMailbox,
}: {
  initialAccounts: ReceivingAccount[];
  initialMailbox: MailboxStatusResponse | null;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [mailbox, setMailbox] = useState(initialMailbox);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { notify } = useNotifications();

  async function reload() {
    const result = await refetchAccountsAction();
    if (result.ok && result.data) {
      setAccounts(result.data.accounts);
      if (result.data.mailbox) setMailbox(result.data.mailbox);
    }
  }

  function handleCreate(formData: FormData) {
    setFormError(null);
    startTransition(async () => {
      const result = await createAccountAction(formData);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      notify({ tone: "success", title: "Cuenta agregada" });
      await reload();
    });
  }

  function handleDelete(account: ReceivingAccount) {
    startTransition(async () => {
      const result = await deleteAccountAction(account.id);
      if (!result.ok) {
        notify({ tone: "danger", title: "No se pudo eliminar", description: result.error ?? undefined });
        return;
      }
      setAccounts((current) => current.filter((a) => a.id !== account.id));
      notify({ tone: "info", title: "Cuenta eliminada" });
    });
  }

  function handleRefreshMailbox() {
    startTransition(async () => {
      const result = await refreshMailboxAction();
      if (result.ok && result.data) {
        setMailbox(result.data);
        notify({
          tone: result.data.mailboxStatus === "VERIFIED" ? "success" : "info",
          title:
            result.data.mailboxStatus === "VERIFIED"
              ? "Buzón verificado"
              : "Aún no recibimos correos",
        });
      } else {
        notify({ tone: "danger", title: "No se pudo actualizar", description: result.error ?? undefined });
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Estado del buzón (onboarding) */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Buzón de reenvío
        </h2>
        {mailbox ? (
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-500">Correo del buzón</p>
                <p className="break-all font-mono text-sm text-slate-900">{mailbox.address}</p>
              </div>
              <span
                className={
                  mailbox.mailboxStatus === "VERIFIED"
                    ? "inline-flex w-fit items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700"
                    : "inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                }
              >
                {mailbox.mailboxStatus === "VERIFIED" ? "🟢 Verificado" : "🟡 Pendiente"}
              </span>
            </div>

            {mailbox.mailboxStatus !== "VERIFIED" ? (
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-medium text-slate-700">
                  Configura el reenvío de tus alertas bancarias a este correo:
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {mailbox.instructions.map((instruction) => (
                    <li key={instruction.bank}>
                      <span className="font-medium">{bankLabel(instruction.bank)}:</span>{" "}
                      {instruction.steps}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-green-700">
                Todo listo: recibimos correos de tu banco y podemos verificar pagos (🟢).
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={pending}
              onClick={handleRefreshMailbox}
            >
              {pending ? "Revisando…" : "Ya configuré el reenvío"}
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No pudimos cargar el estado del buzón. Intenta recargar la página.
          </div>
        )}
      </section>

      {/* Cuentas receptoras */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Cuentas receptoras
        </h2>

        {accounts.length === 0 ? (
          <EmptyState
            icon="🏦"
            title="Aún no tienes cuentas receptoras"
            description="Agrega la cuenta donde recibes los pagos para verificar comprobantes."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {bankLabel(account.bank)}
                    {account.alias ? ` · ${account.alias}` : ""}
                  </p>
                  <p className="font-mono text-xs text-slate-500">{account.accountNumber}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleDelete(account)}
                >
                  Eliminar
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          action={handleCreate}
          className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <p className="text-sm font-medium text-slate-700">Agregar cuenta</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Banco
              <select
                name="bank"
                required
                defaultValue=""
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="" disabled>
                  Elige…
                </option>
                {BANK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Número de cuenta
              <input
                name="accountNumber"
                required
                inputMode="numeric"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Alias (opcional)
              <input
                name="alias"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>
          </div>
          {formError ? (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <Button type="submit" size="sm" className="self-start" disabled={pending}>
            {pending ? "Guardando…" : "Agregar cuenta"}
          </Button>
        </form>
      </section>
    </div>
  );
}
