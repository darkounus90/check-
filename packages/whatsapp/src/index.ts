/**
 * Capa WhatsApp (Baileys): instancia, humanización, pool y enrutador.
 *
 * Placeholder de la Épica 1 (E01-T9): contratos de instancia y enrutador.
 * La implementación real multi-número con Baileys, humanización anti-baneo,
 * warmeo, pool y health checks llega en la Épica 7; el enrutador de QR con
 * failover y fallback a PWA en la Épica 8.
 */

/** Estado de salud de un número del pool. */
export type NumberHealth = "connected" | "degraded" | "banned" | "warming";

/** Una instancia de WhatsApp asociada a un número. */
export interface WhatsAppInstance {
  /** Número en formato E.164 (placeholder). */
  readonly phoneNumber: string;
  readonly health: NumberHealth;
  /** Envía un mensaje de texto humanizado a un destinatario. */
  sendText(to: string, body: string): Promise<void>;
}

/** Enruta un negocio (por su ID opaco) al número sano del momento. */
export interface WhatsAppRouter {
  /** Devuelve el número activo para un negocio, o null si el pool está caído. */
  resolveActiveNumber(businessOpaqueId: string): WhatsAppInstance | null;
}
