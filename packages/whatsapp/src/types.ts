/**
 * Contratos (puertos) de la capa WhatsApp. Se mantienen mínimos y estructurales para
 * poder inyectar fakes en tests sin BD/Storage/Redis reales — mismo principio que
 * `VoucherStore` en `apps/workers/src/ocr/ocr.service.ts`.
 *
 * La implementación real de estos puertos vive en `apps/workers` (Prisma, Supabase
 * Storage REST, BullMQ). Grupo A de la Épica 7 (E07-T1/T2/T3): instancia base.
 */

/** Estado de salud de un número del pool (espejo del enum `NumberHealth` del schema). */
export type WhatsAppNumberHealth = "connected" | "degraded" | "banned" | "warming";

// ─────────────────────────────────────────────────────────────
// E07-T1 — persistencia del auth-state de Baileys en Postgres
// ─────────────────────────────────────────────────────────────

/**
 * Puerto de persistencia del estado de autenticación de una instancia (E07-T1).
 * Guarda/lee el blob JSON del `WaSession.authState` por `waNumberId`. El formato del
 * blob (serialización BufferJSON de creds+keys) lo maneja `db-auth-state.ts`; este
 * puerto solo mueve el JSON hacia/desde la BD.
 */
export interface WaSessionStore {
  /** Devuelve el `authState` persistido de un número, o `null` si aún no hay sesión. */
  loadAuthState(waNumberId: string): Promise<unknown | null>;
  /** Persiste (upsert) el `authState` de un número. */
  saveAuthState(waNumberId: string, authState: unknown): Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// E07-T2 — ingesta del comprobante al pipeline OCR
// ─────────────────────────────────────────────────────────────

/** Resuelve el negocio destino a partir del número CHECK que recibió el mensaje (E07-T2). */
export interface BusinessResolver {
  /**
   * Devuelve el `businessId` asignado a un `waNumberId` (vía `NumberPoolAssignment`),
   * o `null` si el número no tiene negocio asignado. Ver limitación N↔M en
   * `resolveBusinessId` (apps/workers): por ahora toma la asignación de mayor prioridad.
   */
  resolveBusinessId(waNumberId: string): Promise<string | null>;
}

/** Sube los bytes del comprobante a Storage bajo la misma convención del pipeline (E07-T2). */
export interface VoucherStorageUploader {
  uploadVoucher(storagePath: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

/** Crea el `Voucher` y persiste el mapeo conversación↔voucher (`WaVoucherContext`) (E07-T2). */
export interface VoucherIngestStore {
  /** Crea el `Voucher` ligado al negocio con su `storagePath`; devuelve su id. */
  createVoucher(businessId: string, storagePath: string): Promise<{ id: string }>;
  /** Persiste de qué chat (JID) y por qué número CHECK llegó el comprobante. */
  saveVoucherContext(voucherId: string, remoteJid: string, waNumberId: string): Promise<void>;
}

/** Encola el OCR del `Voucher` en la MISMA cola del pipeline (`ocr-processing`) (E07-T2). */
export interface OcrEnqueuer {
  enqueueVoucherOcr(voucherId: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// E07-T3 — respuesta del semáforo
// ─────────────────────────────────────────────────────────────

/** Veredicto antifraude resuelto de una `Transaction` que dispara la respuesta (E07-T3). */
export type ResolvedVerdict = "VERIFIED" | "SUSPICIOUS";

/** Lee de qué chat/número responder un veredicto, a partir del `voucherId` (E07-T3). */
export interface VoucherContextReader {
  /** Devuelve el contexto WhatsApp de un comprobante, o `null` si no vino por WhatsApp. */
  getVoucherContext(
    voucherId: string,
  ): Promise<{ remoteJid: string; waNumberId: string } | null>;
}

// ─────────────────────────────────────────────────────────────
// Configuración/callbacks de la instancia
// ─────────────────────────────────────────────────────────────

/** Callbacks de ciclo de vida de una instancia (E07-T1/T2). */
export interface WhatsAppInstanceCallbacks {
  /** Se invoca con el string del QR de vinculación cada vez que Baileys lo emite (E07-T1). */
  onQr?: (qr: string) => void;
  /** Se invoca cuando la instancia queda conectada y autenticada (`connection: "open"`). */
  onConnected?: () => void;
  /**
   * Se invoca cuando la sesión se cierra de forma definitiva (logout / número deslogueado):
   * el auth-state ya no sirve y hará falta re-escanear QR. No se dispara en reconexiones
   * transitorias (esas se manejan solas).
   */
  onLoggedOut?: () => void;
}
