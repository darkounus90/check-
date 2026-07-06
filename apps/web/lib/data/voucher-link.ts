import "server-only";

import { getDashboardSession } from "@/lib/auth/session";

/**
 * Enlace de subida del negocio del usuario autenticado (E10-T3).
 *
 * GAP DOCUMENTADO (contrato pendiente en apps/api, fuera de alcance de esta ola):
 * la subida autenticada de un comprobante ligado al negocio del cajero requeriría o bien
 *   (a) un endpoint autenticado `POST /vouchers` que resuelva el `businessId` del JWT, o
 *   (b) que `GET /me` exponga el `opaqueId` del negocio para reutilizar la ruta pública
 *       existente `POST /public/n/:opaqueId/vouchers`.
 * Hoy NO existe ninguno de los dos: `/me` sólo devuelve `userId/email/businessId/role`
 * (ver apps/api/src/me/me.controller.ts) y no hay controlador de vouchers autenticado.
 *
 * Fallback razonable sin tocar el backend: el operador puede inyectar el `opaqueId` del
 * negocio en build via `NEXT_PUBLIC_BUSINESS_OPAQUE_ID` (útil en despliegues de un solo
 * negocio o entornos de demo). Si está presente, el cajero sube por la ruta pública
 * existente y ve el estado en vivo. Si no, la vista muestra un aviso claro de que la
 * subida autenticada aún no está habilitada, sin romper el resto del dashboard.
 */
export interface CashierUploadLink {
  /** opaqueId para `POST /public/n/:opaqueId/vouchers`, o null si no hay forma de obtenerlo. */
  opaqueId: string | null;
}

export async function getCashierUploadLink(): Promise<CashierUploadLink> {
  const session = await getDashboardSession();
  if (!session) return { opaqueId: null };

  // No hay endpoint que exponga el opaqueId por sesión. Fallback por env (ver doc arriba).
  const configured = process.env.NEXT_PUBLIC_BUSINESS_OPAQUE_ID?.trim();
  return { opaqueId: configured || null };
}
