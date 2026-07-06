import { getContentType, type proto, type WAMessage } from "@whiskeysockets/baileys";

/**
 * MIME → extensión del objeto en Storage. Es el MISMO contrato que la ingesta pública
 * (`ALLOWED_VOUCHER_MIME_TYPES` en `apps/api/src/public/public.constants.ts`): un
 * comprobante que entra por WhatsApp debe quedar en Storage igual que uno que entra por
 * la PWA, para que el pipeline OCR (E05/E06) no distinga el canal de origen.
 */
export const ALLOWED_VOUCHER_MIME_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Comprobante detectado en un mensaje entrante, listo para descargar/subir/encolar. */
export interface DetectedVoucherMedia {
  /** Tipo de contenido Baileys a descargar (`imageMessage` o `documentMessage`). */
  readonly contentType: "imageMessage" | "documentMessage";
  /** MIME reportado por WhatsApp (validado contra `ALLOWED_VOUCHER_MIME_TYPES`). */
  readonly mimeType: string;
  /** Extensión del objeto en Storage según el MIME. */
  readonly extension: string;
}

/**
 * Decide si un mensaje entrante trae un comprobante (imagen o PDF) que debamos meter al
 * pipeline (E07-T2), y normaliza sus datos de media. Devuelve `null` si el mensaje no es
 * un comprobante procesable (texto, sticker, audio, imagen de tipo no soportado, etc.):
 * el llamador simplemente lo ignora.
 *
 * Reglas:
 * - `imageMessage`: se acepta si su MIME está en `ALLOWED_VOUCHER_MIME_TYPES` (o si falta
 *   el MIME, se asume `image/jpeg`, que es lo que envía WhatsApp para fotos).
 * - `documentMessage`: se acepta solo si su MIME está permitido (típicamente PDF); así un
 *   cliente puede mandar el comprobante como archivo PDF, no solo como foto.
 */
export function detectVoucherMedia(message: proto.IMessage | null | undefined): DetectedVoucherMedia | null {
  if (!message) return null;
  const contentType = getContentType(message);

  if (contentType === "imageMessage") {
    const mimeType = message.imageMessage?.mimetype ?? "image/jpeg";
    const extension = ALLOWED_VOUCHER_MIME_TYPES[mimeType];
    if (!extension) return null;
    return { contentType: "imageMessage", mimeType, extension };
  }

  if (contentType === "documentMessage") {
    const mimeType = message.documentMessage?.mimetype ?? "";
    const extension = ALLOWED_VOUCHER_MIME_TYPES[mimeType];
    if (!extension) return null;
    return { contentType: "documentMessage", mimeType, extension };
  }

  return null;
}

/** Extrae el JID del chat de origen de un mensaje (a quién responder). `null` si falta. */
export function remoteJidOf(message: Pick<WAMessage, "key">): string | null {
  return message.key.remoteJid ?? null;
}

/**
 * Filtra mensajes que NO debemos procesar aunque traigan media (E07-T2):
 * - `fromMe`: mensajes que envió la propia instancia (evita bucles).
 * - status broadcast (`status@broadcast`): no es una conversación de cliente.
 */
export function isProcessableIncoming(message: Pick<WAMessage, "key">): boolean {
  if (message.key.fromMe) return false;
  if (message.key.remoteJid === "status@broadcast") return false;
  return Boolean(message.key.remoteJid);
}
