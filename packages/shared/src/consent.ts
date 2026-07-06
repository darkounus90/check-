/**
 * Consentimiento y aviso de privacidad (Épica 12, E12-T5).
 *
 * Objetivo: registrar de forma auditable que un titular VIO/ACEPTÓ el aviso de privacidad en un
 * punto de entrada (PWA de subida `/n`, dashboard, o el copy de WhatsApp). Cumple el deber de
 * información y consentimiento de la Ley 1581/2012 (habeas data, Colombia).
 *
 * Este módulo define el copy canónico del aviso, su versión, y el contrato del registro de
 * consentimiento. La persistencia vive en `apps/api` (`ConsentService` sobre la tabla
 * `privacy_consents`, ver migración E12-T5).
 */

/** Versión del aviso de privacidad. Al cambiar el copy, se sube la versión ⇒ se re-solicita. */
export const PRIVACY_NOTICE_VERSION = "2026-07-06" as const;

/** Puntos de entrada donde se muestra/registra el aviso. */
export type ConsentChannel = "pwa" | "dashboard" | "whatsapp";

/**
 * Copy canónico del aviso de privacidad (resumen operativo, no reemplaza la política completa).
 * Un solo texto reutilizado por PWA, dashboard y WhatsApp para consistencia legal.
 */
export const PRIVACY_NOTICE_TEXT =
  "CHECK trata los datos de tus comprobantes de pago (imágenes, montos, números de aprobación y " +
  "datos de contacto) con la finalidad exclusiva de verificar transferencias y prevenir fraude. " +
  "Tus datos se almacenan cifrados y se conservan solo por el tiempo necesario para esa finalidad. " +
  "Puedes ejercer tus derechos de acceso, rectificación y eliminación (habeas data, Ley 1581 de " +
  "2012) escribiendo al negocio. Al continuar, aceptas este tratamiento.";

/** Copy corto para el chat de WhatsApp (una línea con enlace a la política). */
export const PRIVACY_NOTICE_WHATSAPP =
  "🔒 CHECK verifica tu comprobante. Tratamos tus datos solo para verificar el pago y prevenir " +
  "fraude, cifrados y por el tiempo necesario (habeas data, Ley 1581/2012). Al enviar tu " +
  "comprobante aceptas este tratamiento.";

/** Entrada para registrar un consentimiento. */
export interface ConsentInput {
  /** Negocio en cuyo punto de entrada se aceptó (si aplica). */
  readonly businessId?: string | null;
  /** Canal donde se mostró el aviso. */
  readonly channel: ConsentChannel;
  /** Identificador del titular en ese canal: userId (dashboard), IP/uuid (PWA), JID (WhatsApp). */
  readonly subjectRef: string;
  /** Versión del aviso aceptada. */
  readonly noticeVersion?: string;
  /** Metadatos (user agent, etc.). Sin PII innecesaria. */
  readonly metadata?: Record<string, unknown>;
}

/** Registro de consentimiento normalizado, listo para persistir. */
export interface ConsentRecord {
  readonly businessId: string | null;
  readonly channel: ConsentChannel;
  readonly subjectRef: string;
  readonly noticeVersion: string;
  readonly metadata: Record<string, unknown>;
  readonly acceptedAt: string; // ISO
}

/** Normaliza una entrada de consentimiento (reloj inyectable). */
export function buildConsentRecord(
  input: ConsentInput,
  clock: () => Date = () => new Date(),
): ConsentRecord {
  return {
    businessId: input.businessId ?? null,
    channel: input.channel,
    subjectRef: input.subjectRef,
    noticeVersion: input.noticeVersion ?? PRIVACY_NOTICE_VERSION,
    metadata: input.metadata ?? {},
    acceptedAt: clock().toISOString(),
  };
}
