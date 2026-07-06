// Cliente del enrutador de QR público (Épica 8). Server-side: la página `/n/{opaqueId}`
// lo consulta para decidir si redirige a WhatsApp (`wa.me`) o renderiza la PWA de subida.
//
// D3: el opaqueId es un identificador no enumerable; NUNCA se loguea aquí ni en consumidores.

import { PublicApiError } from "@/lib/public-api";

/**
 * Respuesta de `GET /public/n/:opaqueId/route`. Discriminada por `action`:
 * - `whatsapp`: redirigir a `waMeUrl`; `reason` distingue primario de failover.
 * - `pwa`: ningún número sano en el pool del negocio → renderizar la PWA (Épica 9).
 */
export type QrRoute =
  | { action: "whatsapp"; waMeUrl: string; reason: "primary" | "failover" }
  | { action: "pwa" };

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

/**
 * Resuelve el enrutado de un escaneo server-side. Devuelve `null` si el enlace no existe
 * (404), para que la página muestre el mismo mensaje de enlace inválido que la PWA.
 */
export async function getQrRoute(opaqueId: string): Promise<QrRoute | null> {
  const response = await fetch(
    `${apiBaseUrl()}/public/n/${encodeURIComponent(opaqueId)}/route`,
    { cache: "no-store" },
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new PublicApiError("No se pudo resolver el enlace del negocio.", response.status);
  }

  return (await response.json()) as QrRoute;
}
