import "server-only";

import type { ReceiverBank } from "@/lib/data/accounts";
import { apiFetch } from "@/lib/data/api-client";

/** Estado del buzón entrante (enum `MailboxStatus` del schema). */
export type MailboxStatus = "PENDING" | "VERIFIED";

/** Proveedor del correo personal del dueño. */
export type MailProvider = "GMAIL" | "OUTLOOK" | "OTHER";

/** Guía de conexión "casi 1-clic" por proveedor (Opción B). */
export interface MailboxProviderGuide {
  provider: MailProvider;
  label: string;
  settingsUrl: string | null;
  steps: string[];
}

/**
 * Estado del buzón + guías de conexión (respuesta de `GET /onboarding/mailbox`,
 * controlador `MailboxController`).
 */
export interface MailboxStatusResponse {
  address: string;
  mailboxStatus: MailboxStatus;
  /** Regla dura: sin buzón verificado nunca se emite 🟢. */
  canEmitGreen: boolean;
  /** Modo "solo comprobante": el banco del dueño no envía correos de abono (ej. Bre-B). */
  noBankEmail: boolean;
  /** Estado de la auto-confirmación del reenvío de Gmail. */
  forwarding: { confirmed: boolean; code: string | null };
  /** Guías de conexión por proveedor del correo personal. */
  providerGuides: MailboxProviderGuide[];
  /** Referencia: reenvío desde el propio banco, por banco receptor. */
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
