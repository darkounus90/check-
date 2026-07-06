import "server-only";

import type { ReceiverBank } from "@/lib/data/accounts";
import { apiFetch } from "@/lib/data/api-client";

/** Estado del buzón entrante (enum `MailboxStatus` del schema). */
export type MailboxStatus = "PENDING" | "VERIFIED";

/**
 * Estado del buzón + instrucciones de reenvío por banco (respuesta de
 * `GET /onboarding/mailbox`, controlador `MailboxController` de E03-T7/T8).
 */
export interface MailboxStatusResponse {
  address: string;
  mailboxStatus: MailboxStatus;
  /** Regla dura: sin buzón verificado nunca se emite 🟢. */
  canEmitGreen: boolean;
  instructions: { bank: ReceiverBank; steps: string }[];
}

/**
 * Estado del buzón de reenvío del negocio, vía API (endpoint existente
 * `GET /onboarding/mailbox`, aislado por negocio server-side). Lo consume la vista de
 * cuentas/onboarding del dueño (E10-T8).
 */
export async function getMailboxStatus(): Promise<MailboxStatusResponse> {
  return apiFetch<MailboxStatusResponse>("/onboarding/mailbox");
}
