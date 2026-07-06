"use server";

import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@/lib/auth/session";
import type { ReceiverBank, ReceivingAccount } from "@/lib/data/accounts";
import { getReceivingAccounts } from "@/lib/data/accounts";
import { apiFetch, DashboardApiError } from "@/lib/data/api-client";
import { getMailboxStatus, type MailboxStatusResponse } from "@/lib/data/mailbox";
import {
  type DashboardTransaction,
  listTransactions,
} from "@/lib/data/transactions";

/**
 * Server Actions del dashboard (Épica 10, Grupos B/C/D). Toda mutación y refetch vive
 * aquí para heredar el aislamiento RLS que la API aplica server-side (patrón E10-T2).
 * Nunca se loguean tokens ni claims.
 */

/** Resultado genérico de una acción con posible mensaje de error en español. */
export interface ActionResult<T = undefined> {
  ok: boolean;
  error: string | null;
  data?: T;
}

function messageForStatus(status: number | null): string {
  switch (status) {
    case 401:
    case 403:
      return "No tienes permiso para hacer esto.";
    case 404:
      return "No encontramos el recurso solicitado.";
    case 400:
      return "Revisa los datos e intenta de nuevo.";
    default:
      return "Algo salió mal. Intenta de nuevo en unos segundos.";
  }
}

function toActionError(error: unknown): string {
  if (error instanceof DashboardApiError) {
    return messageForStatus(error.status);
  }
  return "Algo salió mal. Intenta de nuevo en unos segundos.";
}

/**
 * Refetch de transacciones (E10-T4/T5). Lo invoca el cliente cuando el hook de Realtime
 * señala un cambio, o en polling de respaldo. Devuelve la lista fresca sin recargar.
 */
export async function refetchTransactionsAction(): Promise<
  ActionResult<DashboardTransaction[]>
> {
  try {
    const data = await listTransactions();
    return { ok: true, error: null, data };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Crea una cuenta receptora (solo dueño). E10-T8. */
export async function createAccountAction(
  formData: FormData,
): Promise<ActionResult<ReceivingAccount>> {
  const session = await getDashboardSession();
  if (!session || session.role !== "OWNER") {
    return { ok: false, error: "No tienes permiso para hacer esto." };
  }

  const bank = String(formData.get("bank") ?? "").trim() as ReceiverBank;
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const alias = String(formData.get("alias") ?? "").trim();

  if (!bank) return { ok: false, error: "Elige un banco." };
  if (!accountNumber) return { ok: false, error: "Escribe el número de cuenta." };

  try {
    const data = await apiFetch<ReceivingAccount>("/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bank, accountNumber, alias: alias || undefined }),
    });
    revalidatePath("/dashboard/cuentas");
    return { ok: true, error: null, data };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Elimina una cuenta receptora (solo dueño). E10-T8. */
export async function deleteAccountAction(id: string): Promise<ActionResult> {
  const session = await getDashboardSession();
  if (!session || session.role !== "OWNER") {
    return { ok: false, error: "No tienes permiso para hacer esto." };
  }
  try {
    await apiFetch(`/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    revalidatePath("/dashboard/cuentas");
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Re-chequea el estado del buzón de reenvío (solo dueño). E10-T8. */
export async function refreshMailboxAction(): Promise<
  ActionResult<MailboxStatusResponse>
> {
  const session = await getDashboardSession();
  if (!session || session.role !== "OWNER") {
    return { ok: false, error: "No tienes permiso para hacer esto." };
  }
  try {
    const data = await apiFetch<MailboxStatusResponse>("/onboarding/mailbox/refresh", {
      method: "POST",
    });
    revalidatePath("/dashboard/cuentas");
    return { ok: true, error: null, data };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Refetch de cuentas + buzón (para refrescar la vista tras una mutación). E10-T8. */
export async function refetchAccountsAction(): Promise<
  ActionResult<{ accounts: ReceivingAccount[]; mailbox: MailboxStatusResponse | null }>
> {
  try {
    const [accounts, mailbox] = await Promise.all([
      getReceivingAccounts(),
      getMailboxStatus().catch(() => null),
    ]);
    return { ok: true, error: null, data: { accounts, mailbox } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
