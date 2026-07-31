"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  createAccountAction,
  deleteAccountAction,
  refetchAccountsAction,
  refreshMailboxAction,
  setNoBankEmailAction,
} from "@/app/(dashboard)/actions";
import { useNotifications } from "@/app/(dashboard)/notifications";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state-views";
import type { ReceiverBank, ReceivingAccount } from "@/lib/data/accounts";
import type { MailboxStatusResponse, MailProvider } from "@/lib/data/mailbox";

/**
 * Configuración de cuentas receptoras + conexión del correo del dueño (buzón de reenvío).
 * La conexión usa el enfoque "casi 1-clic" (Opción B): guía por proveedor con la dirección
 * lista para copiar, auto-confirmación del código de Gmail y sondeo en vivo del primer
 * correo. Además soporta el modo "solo comprobante" para bancos que no envían correos.
 * Escritura sólo para el dueño, vía Server Actions que la API valida (RolesGuard).
 */

const BANK_OPTIONS: { value: ReceiverBank; label: string }[] = [
  { value: "NEQUI", label: "Nequi" },
  { value: "DAVIPLATA", label: "DaviPlata" },
  { value: "BANCOLOMBIA", label: "Bancolombia" },
  { value: "DAVIVIENDA", label: "Davivienda" },
  { value: "BBVA", label: "BBVA" },
];

/** Billeteras cuya "cuenta" es una llave Bre-B = número de celular (no número de cuenta). */
const WALLET_BANKS: ReceiverBank[] = ["NEQUI", "DAVIPLATA"];

function isWallet(bank: ReceiverBank): boolean {
  return WALLET_BANKS.includes(bank);
}

function bankLabel(bank: ReceiverBank): string {
  return BANK_OPTIONS.find((option) => option.value === bank)?.label ?? bank;
}

/** Cómo se llama el identificador de la cuenta según la entidad. */
function identifierLabel(bank: ReceiverBank): string {
  return isWallet(bank) ? "Celular (llave Bre-B)" : "Número de cuenta";
}

/** Cada cuánto sondeamos el estado del buzón mientras está pendiente (ms). */
const POLL_INTERVAL_MS = 8000;

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
  const [newBank, setNewBank] = useState<ReceiverBank | "">("");
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
      setNewBank("");
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

  return (
    <div className="flex flex-col gap-8">
      <MailboxConnect
        mailbox={mailbox}
        pending={pending}
        onMailboxChange={setMailbox}
        startTransition={startTransition}
        notify={notify}
      />

      {/* Cuentas receptoras (dónde recibes el dinero: entidad + número de cuenta o llave). */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Dónde recibes los pagos
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            La entidad y la cuenta (o el celular/llave Bre-B) donde te llega el dinero. Con esto
            cruzamos que el comprobante coincida con tu cuenta.
          </p>
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            icon="🏦"
            title="Aún no registras dónde recibes"
            description="Agrega tu Nequi, Daviplata o cuenta de banco para verificar los comprobantes."
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
                  <p className="text-xs text-slate-500">
                    {identifierLabel(account.bank)}:{" "}
                    <span className="font-mono text-slate-700">{account.accountNumber}</span>
                  </p>
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
              Entidad
              <select
                name="bank"
                required
                value={newBank}
                onChange={(e) => setNewBank(e.target.value as ReceiverBank)}
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
              {newBank ? identifierLabel(newBank) : "Número de cuenta o celular"}
              <input
                name="accountNumber"
                required
                inputMode={newBank && isWallet(newBank) ? "tel" : "numeric"}
                placeholder={newBank && isWallet(newBank) ? "3001234567" : ""}
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

/** Sección de conexión del correo del dueño (buzón de reenvío + modo solo comprobante). */
function MailboxConnect({
  mailbox,
  pending,
  onMailboxChange,
  startTransition,
  notify,
}: {
  mailbox: MailboxStatusResponse | null;
  pending: boolean;
  onMailboxChange: (m: MailboxStatusResponse) => void;
  startTransition: (cb: () => void) => void;
  notify: ReturnType<typeof useNotifications>["notify"];
}) {
  const [provider, setProvider] = useState<MailProvider>("GMAIL");
  const [copied, setCopied] = useState(false);

  const verified = mailbox?.mailboxStatus === "VERIFIED";
  const noBankEmail = mailbox?.noBankEmail === true;

  // Sondeo en vivo: mientras el buzón esté pendiente y no estemos en modo solo-comprobante,
  // preguntamos al backend si ya llegó el primer correo (o si se auto-confirmó el reenvío).
  // Así el 🟡→🟢 y el "reenvío confirmado" aparecen solos, sin que el dueño pulse nada.
  const onMailboxChangeRef = useRef(onMailboxChange);
  onMailboxChangeRef.current = onMailboxChange;
  useEffect(() => {
    if (!mailbox || verified || noBankEmail) return;
    let active = true;
    const id = setInterval(async () => {
      const result = await refreshMailboxAction();
      if (active && result.ok && result.data) onMailboxChangeRef.current(result.data);
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [mailbox, verified, noBankEmail]);

  if (!mailbox) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Conecta tu correo
        </h2>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No pudimos cargar el estado del buzón. Intenta recargar la página.
        </div>
      </section>
    );
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(mailbox!.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify({ tone: "info", title: "Copia el correo manualmente", description: mailbox!.address });
    }
  }

  function handleRefreshMailbox() {
    startTransition(async () => {
      const result = await refreshMailboxAction();
      if (result.ok && result.data) {
        onMailboxChange(result.data);
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

  function handleSetNoBankEmail(value: boolean) {
    startTransition(async () => {
      const result = await setNoBankEmailAction(value);
      if (result.ok && result.data) {
        onMailboxChange(result.data);
        notify({
          tone: "info",
          title: value ? "Modo solo comprobante activado" : "Volvimos a esperar tu correo",
        });
      } else {
        notify({ tone: "danger", title: "No se pudo cambiar", description: result.error ?? undefined });
      }
    });
  }

  const guide = mailbox.providerGuides.find((g) => g.provider === provider);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Conecta tu correo
      </h2>

      {/* Modo solo comprobante: el banco del dueño no envía correos de abono. */}
      {noBankEmail ? (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🟡</span>
            <p className="text-sm font-medium text-amber-900">Modo solo comprobante</p>
          </div>
          <p className="text-sm text-amber-800">
            Tu banco no envía correos de abono, así que verificamos cada pago con el comprobante
            (lectura del recibo + defensas antifraude), <strong>sin</strong> confirmación del banco.
            Los pagos legítimos quedan en 🟡 provisional: es un nivel de certeza menor que el 🟢.
          </p>
          <p className="text-sm text-amber-800">
            Si tu banco sí manda correos de «recibiste una transferencia», conéctalo para subir a 🟢.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() => handleSetNoBankEmail(false)}
          >
            Conectar mi correo
          </Button>
        </div>
      ) : verified ? (
        // Buzón verificado: todo listo.
        <div className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm text-green-700/80">Correo conectado</p>
              <p className="break-all font-mono text-sm text-green-900">{mailbox.address}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-green-200 bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
              🟢 Verificado
            </span>
          </div>
          <p className="text-sm text-green-700">
            Recibimos los correos de tu banco: podemos confirmar pagos con 🟢.
          </p>
        </div>
      ) : (
        // Onboarding "casi 1-clic": guía por proveedor + auto-confirmación + sondeo en vivo.
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">
                Reenvía a este correo las alertas de tu banco. Nosotros nos encargamos del resto.
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="break-all rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-900">
                  {mailbox.address}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={copyAddress}>
                  {copied ? "¡Copiado!" : "Copiar"}
                </Button>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              🟡 Esperando tu correo
            </span>
          </div>

          {/* Selector de proveedor. */}
          <div className="flex flex-wrap gap-2">
            {mailbox.providerGuides.map((g) => (
              <button
                key={g.provider}
                type="button"
                onClick={() => setProvider(g.provider)}
                className={
                  provider === g.provider
                    ? "rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-400"
                }
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* Pasos del proveedor elegido. */}
          {guide ? (
            <div className="rounded-md bg-slate-50 p-3">
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-slate-600">
                {guide.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              {guide.settingsUrl ? (
                <a
                  href={guide.settingsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-slate-900 underline underline-offset-2"
                >
                  Abrir la configuración de {guide.label} ↗
                </a>
              ) : null}
            </div>
          ) : null}

          {/* Estado de la auto-confirmación del código de Gmail. */}
          {mailbox.forwarding.confirmed ? (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              ✅ Confirmamos el reenvío automáticamente. Solo falta que actives «reenviar una copia»
              y guardes los cambios.
            </p>
          ) : mailbox.forwarding.code ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Si Gmail te pide el código de confirmación, pega este:{" "}
              <span className="font-mono font-semibold text-slate-900">
                {mailbox.forwarding.code}
              </span>
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={handleRefreshMailbox}>
              {pending ? "Revisando…" : "Ya lo configuré"}
            </Button>
            <span className="text-xs text-slate-400">
              Revisamos solos cada pocos segundos; esto es solo por si tienes prisa.
            </span>
          </div>

          {/* Salida para bancos que no envían correos (ej. Bre-B, solo push/SMS). */}
          <button
            type="button"
            disabled={pending}
            onClick={() => handleSetNoBankEmail(true)}
            className="self-start text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700 disabled:opacity-50"
          >
            Mi banco no envía correos de «recibiste una transferencia»
          </button>
        </div>
      )}
    </section>
  );
}
