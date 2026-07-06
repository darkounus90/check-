import "server-only";

import { apiFetch } from "@/lib/data/api-client";

/** QR estable del negocio (respuesta de `GET /me/qr`, E08-T6). */
export interface BusinessQr {
  /** URL pública que codifica el QR: `${PUBLIC_APP_URL}/n/{opaqueId}`. */
  url: string;
  /** PNG en data URI, listo para <img> y descarga. */
  pngDataUrl: string;
  /** SVG del QR como string, para impresión a cualquier tamaño. */
  svg: string;
}

/**
 * QR imprimible del negocio del dueño (E08-T6), vía el endpoint autenticado `GET /me/qr`
 * (solo OWNER; el negocio se resuelve server-side del JWT, nunca de un parámetro). El QR
 * apunta al enrutador estable `/n/{opaqueId}`, por lo que no caduca aunque roten los números.
 */
export async function getBusinessQr(): Promise<BusinessQr> {
  return apiFetch<BusinessQr>("/me/qr");
}
