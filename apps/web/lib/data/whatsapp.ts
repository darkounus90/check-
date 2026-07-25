import "server-only";

import { apiFetch } from "@/lib/data/api-client";

/** Estado de vinculación de WhatsApp del negocio (tal como lo devuelve `GET /whatsapp/status`). */
export interface WhatsappStatus {
  connected: boolean;
  qr: string | null;
  phoneNumber: string | null;
}

export function getWhatsappStatus(): Promise<WhatsappStatus> {
  return apiFetch<WhatsappStatus>("/whatsapp/status");
}
